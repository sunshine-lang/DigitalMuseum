---
title: 学习 SQLite 索引优化
date: 2026-05-16
---

照着官方文档把联合索引的顺序实验了一遍，用 EXPLAIN QUERY PLAN 验证了最左前缀规则，笔记库的查询快了一个数量级。
