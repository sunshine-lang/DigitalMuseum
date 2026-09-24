/* Shared synthetic conversations for the F03 and F05–F08 prototypes. No real archive data. */
(() => {
  const topics = [
    { type: '约束条件', title: '原始会话保持只读', reason: '保留原始材料，便于回到依据核对。', scope: '本项目的会话接入与读取', quote: '不要修改或删除原始会话，只读取本项目的记录。保留原文，之后才能核对依据。' },
    { type: '做出选择', title: '小项目原型先读取全部会话', reason: '先验证完整读取流程。', scope: '小项目原型阶段', quote: '在小项目原型中，先读取全部已发现会话，以便验证完整的读取流程。' },
    { type: '放弃方案', title: '首版暂不增加多人协作', reason: '先跑通一个人的项目历史。', scope: '当前首版范围', quote: '第一版不做多人协作，先把一个人的项目历史跑通。' },
    { type: '进展变化', title: '已有实现表述，验证依据仍待补充', reason: '原始记录没有说明实现的完整验证结果。', scope: '界面实现与测试状态', quote: '我还没运行测试，不要标成已经验收。', agentQuote: '界面已经写好。' },
    { type: '决定变更', title: '大项目改为先选择读取范围', reason: '避免遗漏未处理材料而不自知。', scope: '超出单次处理规模的项目', quote: '大项目不再一次读完全部会话；把之前的全量读取方案改为先选择范围，避免漏报未处理材料。' }
  ];
  const topicIndex = id => [...id].reduce((sum, c) => sum + c.charCodeAt(0), 0) % topics.length;
  function messages(session) {
    const topic = topics[topicIndex(session.id)];
    return [
      { role: 'user', label: '用户', text: '重新进入这个项目时，先查看已有记录，区分讨论、决定与验证结果。' },
      { role: 'assistant', label: 'Agent', text: topic.agentQuote || '我会保留对话中的时间、角色和上下文，先整理一个可核对的草稿。' },
      { role: 'tool', label: '工具结果', text: '合成工具结果：没有附带构建、测试或线上验收记录。' },
      { role: 'user', label: '用户', text: topic.quote },
      { role: 'assistant', label: 'Agent', text: '收到。整理时保留这段表达的适用范围，并把解释标为待核对。' }
    ];
  }
  function representatives(sessions) {
    const sorted = [...sessions].sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
    return topics.map((_, i) => {
      const matching = sorted.filter(s => topicIndex(s.id) === i);
      return i >= 3 ? matching.at(-1) : matching[0];
    }).filter(Boolean).map(({ id, source, date }) => ({ id, source, date }));
  }
  function events(anchors) {
    return representatives(anchors).map(anchor => {
      const index = topicIndex(anchor.id);
      return { ...topics[index], id: 'event-' + index, topic: index, date: anchor.date, anchor };
    }).sort((a, b) => a.date.localeCompare(b.date) || a.topic - b.topic);
  }
  window.MuseumDemo = Object.freeze({ topics: Object.freeze(topics), topicIndex, messages, representatives, events });
})();
