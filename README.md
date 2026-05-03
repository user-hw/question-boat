# 题舟 - 智能刷题台

一个 Flask + SQLite 的本地刷题 Web 项目，适合个人题库、课程复习和知识库转题。

## 功能

- 刷题模式：选择刷题数量后开始一轮练习
- 随机抽取题目模式：每次点击随机抽取一道题
- 支持按分类和题型筛选
- 手动新增单选、判断、简答题
- 多分类题库管理、搜索、删除
- JSON、CSV、TXT 题库导入和 JSON 导出
- 上传 TXT、Markdown、CSV、JSON 知识库，本地自动生成题目草稿
- 使用 SQLite 保存题库、错题次数和练习统计

## 使用

安装依赖：

```bash
pip install -r requirements.txt
```

启动后端：

```bash
python server.py
```

然后打开：

```text
http://127.0.0.1:5000
```

首次启动会自动创建 `question_boat.db` 并写入示例题目。

## 导入格式

JSON 示例：

```json
{
  "questions": [
    {
      "prompt": "HTTP 200 表示什么？",
      "category": "计算机网络",
      "type": "single",
      "difficulty": "基础",
      "options": ["A. 成功", "B. 未找到", "C. 重定向", "D. 服务器错误"],
      "answer": "A",
      "explanation": "200 OK 表示请求成功。"
    }
  ]
}
```

CSV 列顺序：

```text
prompt,category,type,answer,options,explanation,difficulty
HTTP 200 表示什么？,计算机网络,single,A,A. 成功|B. 未找到|C. 重定向|D. 服务器错误,200 OK 表示请求成功。,基础
```
