// 봇 계산을 서버 본체와 따로 돌리는 작업 스레드 (어려움 봇이 길게 생각해도 다른 방이 멈추지 않게)
const { parentPort } = require('worker_threads');
const Bot = require('./bot.js');

parentPort.on('message', ({ id, table, rack, melded, level }) => {
  let result = null, error = null;
  try { result = Bot.plan(table, rack, melded, level); } catch (e) { error = String((e && e.stack) || e); }
  parentPort.postMessage({ id, result, error });
});
