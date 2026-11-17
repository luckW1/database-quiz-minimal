# 数据库刷题

《数据库原理与应用》专升本极简答题网页。

在线访问：<https://luckw1.github.io/database-quiz-minimal/>

## 功能

- 14 个章节，可单章练习，也可全部章节混合练习。
- 每题随机抽题，支持 10、20、40 题或全部题量。
- 支持随机顺序与原始顺序。
- 单选、多选、判断题选择后立即判题。
- 简答、编程、设计题先思考，再展开参考答案和详细解析。
- 每题显示答案与解析，练习进度和正确率保存在浏览器本地。
- 可只练选择题与判断题，也可重做本轮错题。

## 本地运行

在当前目录启动任意静态文件服务器：

```bash
python -m http.server 4174
```

浏览器打开 `http://localhost:4174/`。

## 文件

```text
index.html            页面结构
styles.css            极简响应式样式
app.js                练习、判题、统计与本地存储
data.js               浏览器题库数据
assets/lucide.min.js  本地图标库
source/question-bank.md 题库原始 Markdown
scripts/build_data.py 从 Markdown 题库生成 data.js
```

更新题库后重新运行：

```bash
python scripts/build_data.py
```
