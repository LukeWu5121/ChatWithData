import os
import pandas as pd
from flask import Flask, request, jsonify
from flask_cors import CORS
from openai import OpenAI
from dotenv import load_dotenv
import uuid
import threading
import sys
import traceback

load_dotenv()

client = OpenAI(
    base_url="https://openrouter.ai/api/v1",
    api_key=os.getenv("OPENAI_API_KEY"),
)

app = Flask(__name__)
CORS(app)

UPLOAD_FOLDER = 'uploads'
if not os.path.exists(UPLOAD_FOLDER):
    os.makedirs(UPLOAD_FOLDER)

# 简化的session存储（单用户demo，用字典即可）
sessions = {}  # {session_id: {"df": DataFrame, "filename": str}}

MODEL_MAP = {
    "google": "mistralai/mistral-large",
    "deepseek": "deepseek/deepseek-chat",
    "openai": "openai/gpt-4o-mini",
    "meta": "meta-llama/llama-3.1-8b-instruct"
}

# ========== Prompt 策略库 ==========

PROMPT_TEMPLATES = {
    # 策略 1: Direct / Zero-Shot (直接生成)
    # 适用场景: 简单统计，如"行数是多少"、"列名是什么"
    "direct": """
You are a Python Data Analyst.
DataFrame Information:
- Columns: {columns}
- Sample Data: {sample}

User Question: {question}

Task: Write Python Pandas code to answer the question.
Requirements:
1. The DataFrame variable `df` is ALREADY LOADED and available. DO NOT create a new DataFrame.
2. Use the existing `df` variable directly (e.g., `df['column']`, `df.head()`, `len(df)`).
3. Assign the final result to the variable `result`.
4. Output ONLY the executable Python code (no markdown, no explanations).
5. DO NOT write `df = pd.DataFrame(...)` or any DataFrame creation code.
""",

    # 策略 2: Chain-of-Thought (CoT) (思维链)
    # 适用场景: 复杂逻辑，如"先按地区分组，算出平均值，再找出最大的那个"
    # 原理: 强迫 AI 在写代码前先用注释写出逻辑，防止幻觉
    "cot": """
You are an Expert Data Scientist.
DataFrame Information:
- Columns: {columns}
- Sample Data: {sample}

User Question: {question}

Task: Let's think step by step to generate the correct Pandas code.
1. Analyze the column types and content.
2. Break down the user's logic into Pandas operations (e.g., groupby -> mean -> sort).
3. Verify if data cleaning (handling NaN) is needed.
4. Write the code with detailed step-by-step comments explaining your reasoning.
5. Assign the final output to `result`.

IMPORTANT:
- The DataFrame variable `df` is ALREADY LOADED and available. DO NOT create a new DataFrame.
- Use the existing `df` variable directly (e.g., `df['column']`, `df.groupby()`, `df.head()`).
- DO NOT write `df = pd.DataFrame(...)` or any DataFrame creation code.
- Include detailed comments explaining your approach and reasoning for each step.

Output format (MUST include comments):
# Step 1: [Explain what you're analyzing and why]
# Step 2: [Explain the operation you're performing]
# Step 3: [Explain any data transformations]
result = ... (Executable Python code with comments)
""",

    # 策略 3: Few-Shot (少样本)
    # 技巧：这里给出的例子(Examples)必须是你希望 AI 模仿的"完美代码"
    "few_shot": """
You are a generic Python Data Analyst.

# 1. Rules you must follow:
- The DataFrame variable `df` is ALREADY LOADED and available. DO NOT create a new DataFrame.
- Use the existing `df` variable directly. DO NOT write `df = pd.DataFrame(...)`.
- Assign the final output to variable `result`.
- Include detailed comments explaining your approach, reasoning, and each step.
- Do not output markdown block, just code with comments.

# 2. Reference Examples (Learn from these patterns):

Example 1 (Simple Count):
User: "How many rows are in the dataset?"
Code: 
# Step 1: Count the total number of rows in the DataFrame
# Reasoning: The user wants a simple count, so we use len() on the DataFrame
result = len(df)

Example 2 (Filtering):
User: "What is the sales amount for date 2023-01-01?"
Code:
# Step 1: Filter the DataFrame to get rows where Date equals '2023-01-01'
# Step 2: Extract the 'Sales' column from the filtered DataFrame
# Step 3: Calculate the sum of sales for that date
# Reasoning: We need to filter first, then extract the column, then sum
result = df[df['Date'] == '2023-01-01']['Sales'].sum()

Example 3 (Grouping & Sorting):
User: "Which region has the highest average profit?"
Code:
# Step 1: Group the DataFrame by 'Region' column
# Step 2: Calculate the mean profit for each region using the 'Profit' column
# Step 3: Sort the results in descending order to get the highest first
# Step 4: Get the index (region name) of the first item, which is the highest
# Reasoning: This requires grouping, aggregation, sorting, and extracting the top result
result = df.groupby('Region')['Profit'].mean().sort_values(ascending=False).index[0]

# 3. Your Task:
DataFrame Columns: {columns}
User Question: {question}

Task: Write the code for the User Question following the style of the examples above. 
IMPORTANT: 
- Break down your approach into clear steps with comments (like "Step 1:", "Step 2:", etc.)
- Explain your reasoning for each step (like "Reasoning: ...")
- Include comments for each major operation you perform
- Follow the exact format shown in the examples above
"""
}

# ========== 安全代码执行层（方案1：轻量级限制）==========

class TimeoutError(Exception):
    """超时异常"""
    pass

def execute_code_safely(code, df, timeout=5):
    """
    安全的代码执行函数（方案1：轻量级限制）
    
    特性：
    1. 超时控制（跨平台）
    2. 命名空间限制（限制危险内置函数）
    3. 数据保护（使用copy）
    
    Args:
        code: 要执行的Python代码字符串
        df: pandas DataFrame
        timeout: 超时时间（秒），默认5秒
    
    Returns:
        tuple: (success: bool, result: any, error: str)
    """
    result_container = {"result": None, "error": None, "completed": False}
    
    def restricted_exec():
        """在受限环境中执行代码"""
        try:
            # 1. 创建安全的内置函数字典（移除危险函数）
            safe_builtins = {
                # 基础类型
                'len': len, 'str': str, 'int': int, 'float': float,
                'bool': bool, 'list': list, 'dict': dict, 'tuple': tuple,
                'set': set, 'frozenset': frozenset,
                # 基础操作
                'min': min, 'max': max, 'sum': sum, 'abs': abs,
                'round': round, 'sorted': sorted, 'reversed': reversed,
                'enumerate': enumerate, 'zip': zip, 'range': range,
                # 字符串操作
                'ord': ord, 'chr': chr, 'hex': hex, 'oct': oct, 'bin': bin,
                # 数学函数（如果需要，可以导入math模块）
                # 移除的危险函数：
                # - open, file (文件操作)
                # - __import__, import (模块导入)
                # - eval, exec, compile (代码执行)
                # - input, raw_input (用户输入)
                # - exit, quit (退出)
                # - dir, vars, globals, locals (命名空间访问)
            }
            
            # 2. 限制可用的模块（只提供pandas）
            safe_modules = {
                'pd': pd,
                'pandas': pd,
            }
            
            # 3. 创建受限的命名空间
            restricted_globals = {
                '__builtins__': safe_builtins,
                'pd': pd,
                'pandas': pd,
            }
            
            # 4. 使用copy保护原始数据
            local_vars = {
                "df": df.copy(),
                "pd": pd,
            }
            
            # 5. 执行代码
            exec(code, restricted_globals, local_vars)
            
            # 6. 获取结果
            result = local_vars.get('result', "No result")
            result_container["result"] = result
            result_container["completed"] = True
            
        except Exception as e:
            result_container["error"] = str(e)
            result_container["completed"] = True
    
    # 创建执行线程
    exec_thread = threading.Thread(target=restricted_exec)
    exec_thread.daemon = True  # 设置为守护线程
    exec_thread.start()
    exec_thread.join(timeout=timeout)
    
    # 检查是否超时
    if exec_thread.is_alive():
        result_container["error"] = f"Code execution timeout (>{timeout}s)"
        result_container["completed"] = True
        # 注意：daemon线程会在主线程退出时自动终止
        # 但无法强制终止正在执行的代码
    
    # 返回结果
    if result_container["error"]:
        return False, None, result_container["error"]
    else:
        return True, result_container["result"], None

def ask_ai(prompt, system_role="You are a helpful data assistant.", model_name="google"):
    try:
        model = MODEL_MAP.get(model_name, MODEL_MAP["google"])
        response = client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": system_role},
                {"role": "user", "content": prompt}
            ],
            extra_headers={
                "HTTP-Referer": "http://localhost:5000",
                "X-Title": "Chat with AI",
            },
            temperature=0.1
        )
        return response.choices[0].message.content
    except Exception as e:
        print(f"AI Error: {e}")
        return None

@app.route('/upload', methods=['POST'])
def upload_file():
    if 'file' not in request.files:
        return jsonify({"error": "No file"}), 400
    
    file = request.files['file']
    if file.filename == '':
        return jsonify({"error": "No selected file"}), 400

    try:
        filepath = os.path.join(UPLOAD_FOLDER, file.filename)
        file.save(filepath)
        df = pd.read_csv(filepath)
        
        # 生成session_id并缓存DataFrame
        session_id = str(uuid.uuid4())
        sessions[session_id] = {
            "df": df,
            "filename": file.filename
        }
        
        welcome_message = f"File {file.filename} uploaded successfully! Dataset contains {len(df)} rows and {len(df.columns)} columns."
        
        return jsonify({
            "status": "success",
            "session_id": session_id,  # 返回session_id给前端
            "filename": file.filename,
            "insight": welcome_message
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/chat', methods=['POST'])
def chat():
    data = request.json
    user_question = data.get('question', '')
    model_name = data.get('model', 'google')
    prompt_strategy = data.get('prompt_strategy', 'direct')  # 获取prompt策略，默认direct
    session_id = data.get('session_id')  # 从请求中获取session_id
    
    if not session_id or session_id not in sessions:
        return jsonify({"answer": "Please upload a file first!", "type": "text"})
    
    # 从session缓存中获取DataFrame（使用copy避免被修改）
    original_df = sessions[session_id]["df"]
    current_df = original_df.copy()  # 使用copy，防止AI代码修改原始数据
    
    # 获取数据信息用于prompt
    columns = list(current_df.columns)
    row_sample = current_df.head(2).to_dict()

    # 根据策略选择对应的prompt模板
    prompt_template = PROMPT_TEMPLATES.get(prompt_strategy, PROMPT_TEMPLATES["direct"])
    
    # 填充prompt模板
    prompt = prompt_template.format(
        columns=columns,
        sample=row_sample,
        question=user_question
    )
    
    # 根据策略选择system role
    if prompt_strategy == "cot":
        system_role = "You are an Expert Data Scientist. Output ONLY executable Python code with step-by-step comments. No markdown, no explanations."
    elif prompt_strategy == "few_shot":
        system_role = "You are a Python Data Analyst. Output ONLY executable Python code following the examples. No markdown, no explanations."
    else:  # direct
        system_role = "You are a Python code generator. Output ONLY executable Python code. No markdown, no explanations."
    
    code = ask_ai(prompt, system_role, model_name)
    
    if code is None:
        return jsonify({
            "answer": "Sorry, AI service is temporarily unavailable. Please try again later.", 
            "type": "text"
        })
    
    # 清理和提取代码（保留思路注释和缩进）
    original_code_with_comments = None
    if code:
        # 保存原始代码（包含注释）用于显示思路
        original_code_with_comments = code.replace("```python", "").replace("```", "").strip()
        
        # 移除markdown代码块标记
        code = code.replace("```python", "").replace("```", "").strip()
        
        # 提取代码：找到包含 "result" 的行，但保留注释和缩进
        lines = code.split('\n')
        code_lines = []
        reasoning_lines = []  # 保存思路注释
        
        for line in lines:
            original_line = line
            line_stripped = line.strip()
            if not line_stripped:
                continue
            
            # 跳过明显的解释文本（非代码注释）
            if line_stripped.lower().startswith(('note:', 'example:', 'here', 'this code', 'the code', 'you can')):
                continue
            
            # ⚠️ 移除重新定义df的代码行（防止bug）
            if line_stripped.startswith('df = pd.DataFrame') or line_stripped.startswith('df = DataFrame'):
                print(f"[WARNING] Removed DataFrame recreation: {line_stripped}")
                continue
            
            # 保留思路注释（以#开头的注释，特别是Step、Reasoning相关的）
            if line_stripped.startswith('#') and ('step' in line_stripped.lower() or 'logic' in line_stripped.lower() or 'explain' in line_stripped.lower() or 'approach' in line_stripped.lower() or 'reason' in line_stripped.lower() or 'reasoning' in line_stripped.lower() or 'analyze' in line_stripped.lower()):
                reasoning_lines.append(original_line)  # 保留原始格式（包括缩进）
            
            # 收集包含 result 或看起来像代码的行
            if 'result' in line_stripped or ('=' in line_stripped and ('df' in line_stripped or 'pd' in line_stripped)) or line_stripped.startswith('if ') or line_stripped.startswith('for ') or line_stripped.startswith('while ') or line_stripped.startswith('def '):
                code_lines.append(original_line)  # 保留原始格式（包括缩进）
            elif code_lines:  # 如果已经开始收集代码，继续收集后续行
                # 保留所有注释行（包括思路注释）
                if line_stripped.startswith('#'):
                    reasoning_lines.append(original_line)
                elif not line_stripped.lower().startswith(('note', 'example')):
                    # 检查是否是代码的延续（如if/for/while的缩进块）
                    if original_line and (original_line[0].isspace() or line_stripped.startswith(('if ', 'elif ', 'else:', 'for ', 'while ', 'def ', 'return ', 'import ', 'from '))):
                        code_lines.append(original_line)  # 保留原始格式（包括缩进）
        
        # 如果提取到代码，使用提取的；否则使用原始（去除首尾空行）
        if code_lines:
            # 合并思路注释和代码，保持顺序
            # 先添加所有思路注释，然后添加代码
            all_lines = []
            # 如果代码中有思路注释，先添加它们
            for line in lines:
                original_line = line
                line_stripped = line.strip()
                if line_stripped.startswith('#') and original_line in reasoning_lines:
                    all_lines.append(original_line)
            # 然后添加所有代码行（包括注释）
            for line in lines:
                original_line = line
                line_stripped = line.strip()
                if original_line in code_lines and original_line not in all_lines:
                    all_lines.append(original_line)
            
            # 如果合并后为空，使用原始代码
            if all_lines:
                code = '\n'.join(all_lines)
            else:
                code = code.strip()
        else:
            code = code.strip()
        
        # 再次检查：如果代码中仍有重新定义df，给出警告
        if 'df = pd.DataFrame' in code or 'df = DataFrame' in code:
            print(f"[WARNING] Code still contains DataFrame recreation, may cause error")
    
    if not code or "Error code: 429" in code:
        return jsonify({
            "answer": "Sorry, AI service is temporarily unavailable. Please try again later.", 
            "type": "text"
        })

    # 调试：打印生成的代码
    print(f"\n[DEBUG] Model: {model_name}")
    print(f"[DEBUG] Question: {user_question}")
    print(f"[DEBUG] Generated code: {code}")
    print(f"[DEBUG] DataFrame shape before execution: {current_df.shape}")

    # 使用安全的代码执行函数
    success, result, error = execute_code_safely(code, current_df, timeout=5)
    
    if not success:
        return jsonify({
            "answer": f"Code execution error: {error}\nGenerated code: {code}", 
            "type": "text"
        })
    
    # 调试：打印结果
    print(f"[DEBUG] Result type: {type(result)}, Value: {result}")
    
    # 构建回复（包含思路和结果）
    answer_parts = []
    
    # 对于CoT和Few-Shot策略，显示思路
    if prompt_strategy in ["cot", "few_shot"]:
        # 提取思路注释
        reasoning = []
        if original_code_with_comments:
            for line in original_code_with_comments.split('\n'):
                line = line.strip()
                # 提取思路注释：Step、Reasoning、Logic、Explain、Approach等关键词
                if line.startswith('#') and ('step' in line.lower() or 'logic' in line.lower() or 'explain' in line.lower() or 'approach' in line.lower() or 'reason' in line.lower() or 'reasoning' in line.lower() or 'analyze' in line.lower()):
                    # 移除#号，保留内容
                    reasoning_text = line.lstrip('#').strip()
                    if reasoning_text:
                        reasoning.append(reasoning_text)
        
        if reasoning:
            answer_parts.append("<div style='background-color: #f0f7ff; padding: 12px; border-radius: 8px; margin-bottom: 12px; border-left: 4px solid #007bff;'>")
            answer_parts.append("<strong>💭 Reasoning Steps:</strong><br>")
            for i, step in enumerate(reasoning, 1):
                answer_parts.append(f"{i}. {step}<br>")
            answer_parts.append("</div>")
        
        # 显示生成的代码（带格式）
        answer_parts.append("<div style='background-color: #f8f9fa; padding: 12px; border-radius: 8px; margin-bottom: 12px;'>")
        answer_parts.append("<strong>📝 Generated Code:</strong><br>")
        answer_parts.append("<pre style='background-color: #2d2d2d; color: #f8f8f2; padding: 12px; border-radius: 6px; overflow-x: auto; margin: 8px 0;'>")
        answer_parts.append(code.replace('<', '&lt;').replace('>', '&gt;'))
        answer_parts.append("</pre>")
        answer_parts.append("</div>")
    
    # 格式化结果
    answer_parts.append("<div style='background-color: #e8f5e9; padding: 12px; border-radius: 8px; border-left: 4px solid #4caf50;'>")
    answer_parts.append("<strong>✅ Analysis Result:</strong><br>")
    if isinstance(result, pd.DataFrame):
        answer_parts.append(result.to_html(classes='data-table', border=0))
    else:
        answer_parts.append(f"<div style='font-size: 18px; font-weight: bold; color: #2e7d32; margin-top: 8px;'>{str(result)}</div>")
    answer_parts.append("</div>")
    
    final_ans = ''.join(answer_parts)
        
    return jsonify({"answer": final_ans, "type": "text"})

if __name__ == '__main__':
    app.run(port=5000, debug=True)
