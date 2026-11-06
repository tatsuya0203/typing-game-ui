"use strict";

const questions = [
  ["今日はいい天気", "きょうはいいてんき"],
  ["一日一歩ずつ", "いちにちいっぽずつ"],
  ["急がば回れ", "いそがばまわれ"],
  ["新しいことに挑戦", "あたらしいことにちょうせん"],
  ["明日の準備をしよう", "あしたのじゅんびをしよう"],
  ["楽しく練習しよう", "たのしくれんしゅうしよう"],
  ["図書館で本を読む", "としょかんでほんをよむ"],
  ["小さな発見", "ちいさなはっけん"],
  ["電車で出かける", "でんしゃででかける"],
  ["写真を撮ろう", "しゃしんをとろう"],
  ["青い空と白い雲", "あおいそらとしろいくも"],
  ["友達と待ち合わせ", "ともだちとまちあわせ"],
  ["おいしいお寿司", "おいしいおすし"],
  ["雨の日の散歩", "あめのひのさんぽ"],
  ["大切なのは続けること", "たいせつなのはつづけること"],
  ["窓を開けて深呼吸", "まどをあけてしんこきゅう"],
  ["音楽を聴く時間", "おんがくをきくじかん"],
  ["週末の予定", "しゅうまつのよてい"],
  ["一緒に頑張ろう", "いっしょにがんばろう"],
  ["自分のペースで進もう", "じぶんのぺーすですすもう"],
];

const ui = Object.fromEntries([...document.querySelectorAll("[id]")].map(el => [el.id, el]));
let phase = "idle";
let session = [];
let index = 0;
let correct = 0;
let mistakes = 0;
let raw = "";
let edges = [];
let startedAt = 0;
let duration = 0;
let ticker;
let countdown;
let composing = false;

// WanaKanaの変換結果から入力経路を作り、複数の表記を組み合わせて受け付ける。
const spellings = [];
if (typeof wanakana !== "undefined") {
  const candidates = new Set(["nn", "n'", "xtsu", "ltsu", "xtu", "ltu", "-"]);
  const alphabet = "abcdefghijklmnopqrstuvwxyz";
  for (const vowel of "aiueo") {
    candidates.add(vowel);
    for (const a of alphabet) {
      candidates.add(a + vowel);
      for (const b of alphabet) candidates.add(a + b + vowel);
    }
  }
  for (const roman of candidates) {
    const kana = roman === "nn" ? "ん" : wanakana.toHiragana(roman, { convertLongVowelMark: false });
    if (/^[ぁ-ゖー]+$/.test(kana)) spellings.push({ roman, kana });
  }
}

function buildEdges(reading) {
  return Array.from({ length: reading.length + 1 }, (_, at) => {
    const options = spellings.filter(s => reading.startsWith(s.kana, at));
    if (reading[at] === "ん" || reading[at] === "っ") {
      for (const next of spellings) {
        if (!reading.startsWith(next.kana, at + 1) || !/^[bcdfghjklmpqrstvwxz]/.test(next.roman)) continue;
        const prefix = reading[at] === "ん" ? "n" : next.roman[0];
        options.push({ roman: prefix + next.roman, kana: reading[at] + next.kana });
      }
    }
    if (at === reading.length - 1 && reading[at] === "ん") options.push({ roman: "n", kana: "ん" });
    return options.sort((a, b) => {
      const aStandard = a.roman === wanakana.toRomaji(a.kana);
      const bStandard = b.roman === wanakana.toRomaji(b.kana);
      return Number(bStandard) - Number(aStandard) || b.kana.length - a.kana.length || a.roman.length - b.roman.length;
    });
  });
}

function defaultSuffix(at) {
  if (at === edges.length - 1) return "";
  const choice = edges[at][0];
  if (!choice) throw new Error("対応していない読み仮名です");
  return choice.roman + defaultSuffix(at + choice.kana.length);
}

function matchInput(value) {
  const visited = new Set();
  function visit(at, typed) {
    const key = `${at}:${typed}`;
    if (visited.has(key)) return null;
    visited.add(key);
    if (typed === value.length) return { suffix: defaultSuffix(at), complete: at === edges.length - 1 };
    const rest = value.slice(typed);
    for (const choice of edges[at]) {
      if (rest.startsWith(choice.roman)) {
        const found = visit(at + choice.kana.length, typed + choice.roman.length);
        if (found) return found;
      } else if (choice.roman.startsWith(rest)) {
        return { suffix: choice.roman.slice(rest.length) + defaultSuffix(at + choice.kana.length), complete: false };
      }
    }
    return null;
  }
  return visit(0, 0);
}

function feedback(message, error = false) {
  ui.feedback.textContent = message;
  ui.feedback.classList.toggle("error", error);
  ui.inputtype.setAttribute("aria-invalid", String(error));
}

function renderStats() {
  ui.correct.textContent = correct;
  ui.incorrect.textContent = mistakes;
  ui.accuracy.textContent = correct + mistakes ? `${(correct / (correct + mistakes) * 100).toFixed(1)}%` : "—";
  ui.elapsed.textContent = (duration / 1000).toFixed(1);
  ui.speed.textContent = duration >= 1000 ? Math.round(correct / (duration / 60000)) : "—";
}

function showQuestion() {
  raw = "";
  edges = buildEdges(session[index][1]);
  ui.bunsyou.textContent = session[index][0];
  ui.reading.textContent = session[index][1];
  ui.altype.textContent = "";
  ui.roma.textContent = defaultSuffix(0);
  ui.inputtype.value = "";
  ui.position.textContent = `${index + 1} / ${session.length}問`;
}

function finish() {
  phase = "finished";
  duration = performance.now() - startedAt;
  clearInterval(ticker);
  ui.inputtype.disabled = true;
  ui.status.textContent = "練習終了";
  ui.bunsyou.textContent = "お疲れさまでした！";
  ui.reading.textContent = ui.altype.textContent = ui.roma.textContent = "";
  ui.startbtn.disabled = false;
  ui.startbtn.textContent = "もう一度練習";
  ui.length.disabled = false;
  renderStats();
  ui.finishtext.textContent = `${session.length}問完了。正確率 ${ui.accuracy.textContent}。`;
  feedback("練習結果が確定しました。");
  ui.startbtn.focus();
}

function start() {
  if (phase === "running" || phase === "countdown") return;
  reset();
  // Fisher-Yatesで重複しない問題順を作る。
  session = [...questions];
  for (let i = session.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [session[i], session[j]] = [session[j], session[i]];
  }
  session = session.slice(0, Number(ui.length.value));
  phase = "countdown";
  ui.startbtn.disabled = true;
  ui.resetbtn.disabled = false;
  ui.length.disabled = true;
  let remaining = 3;
  ui.status.textContent = "まもなく開始";
  ui.bunsyou.textContent = String(remaining);
  feedback("半角英字で入力してください。");
  countdown = setInterval(() => {
    remaining--;
    if (remaining > 0) { ui.bunsyou.textContent = String(remaining); return; }
    clearInterval(countdown);
    phase = "running";
    showQuestion();
    ui.status.textContent = "練習中";
    ui.inputtype.disabled = false;
    ui.inputtype.placeholder = "ここにローマ字を入力";
    ui.inputtype.focus();
    feedback("入力待ち");
    startedAt = performance.now();
    ticker = setInterval(() => { duration = performance.now() - startedAt; renderStats(); }, 100);
  }, 1000);
}

function reset() {
  clearInterval(countdown);
  clearInterval(ticker);
  phase = "idle";
  index = correct = mistakes = duration = 0;
  raw = "";
  composing = false;
  ui.inputtype.value = "";
  ui.inputtype.disabled = true;
  ui.inputtype.placeholder = "開始すると入力できます";
  ui.startbtn.disabled = false;
  ui.startbtn.textContent = "スタート";
  ui.resetbtn.disabled = true;
  ui.length.disabled = false;
  ui.status.textContent = "開始待ち";
  ui.bunsyou.textContent = "準備ができたらスタート";
  ui.reading.textContent = ui.altype.textContent = ui.roma.textContent = ui.finishtext.textContent = "";
  ui.progress.max = Number(ui.length.value);
  ui.progress.value = 0;
  ui.position.textContent = `0 / ${ui.length.value}問`;
  feedback("待機中");
  renderStats();
}

function acceptCharacter(char) {
  if (phase !== "running") return;
  const next = raw + char.toLowerCase();
  const result = matchInput(next);
  if (!result) {
    mistakes++;
    feedback("ミス：表示されたローマ字を確認してください。", true);
  } else {
    raw = next;
    correct++;
    ui.altype.textContent = raw;
    ui.roma.textContent = result.suffix;
    feedback("正しく入力できています。");
    if (result.complete) {
      index++;
      ui.progress.value = index;
      if (index === session.length) { finish(); return; }
      showQuestion();
      feedback("正解！ 次の問題です。");
    }
  }
  ui.inputtype.value = raw;
  renderStats();
}

function undo(value) {
  if (!raw.startsWith(value)) return;
  correct -= raw.length - value.length;
  raw = value;
  ui.inputtype.value = raw;
  ui.altype.textContent = raw;
  ui.roma.textContent = matchInput(raw).suffix;
  feedback("入力を取り消しました。");
  renderStats();
}

ui.startbtn.addEventListener("click", start);
ui.resetbtn.addEventListener("click", () => { reset(); ui.startbtn.focus(); });
ui.backgroundbtn.addEventListener("click", () => {
  document.body.style.backgroundImage = document.body.style.backgroundImage ? "" : 'url("susi.jpg")';
  if (phase === "running") ui.inputtype.focus();
});
ui.length.addEventListener("change", reset);
ui.inputtype.addEventListener("keydown", event => {
  if (phase !== "running" || event.isComposing || composing || event.keyCode === 229) return;
  if (event.ctrlKey || event.metaKey || event.altKey || event.key === "Tab") return;
  if (event.key === "Backspace") {
    event.preventDefault();
    if (raw) undo(raw.slice(0, -1));
  } else if (event.key.length === 1) {
    event.preventDefault();
    if (/^[a-z'-]$/i.test(event.key)) acceptCharacter(event.key);
    else feedback("半角英字に切り替えてください。", true);
  }
});
// ソフトキーボードはinputイベントから受け取り、日本語変換中は採点しない。
ui.inputtype.addEventListener("input", event => {
  if (composing || event.isComposing || phase !== "running") return;
  const value = ui.inputtype.value;
  if (event.inputType === "insertFromPaste") {
    feedback("貼り付けは採点対象外です。");
  } else if (event.inputType?.startsWith("delete")) {
    undo(value);
  } else if (value.startsWith(raw)) {
    const added = value.slice(raw.length);
    if (/^[a-z'-]+$/i.test(added)) {
      for (const char of added) acceptCharacter(char);
    } else feedback("半角英字に切り替えてください。", true);
  }
  ui.inputtype.value = raw;
});
ui.inputtype.addEventListener("paste", event => { event.preventDefault(); feedback("貼り付けは採点対象外です。"); });
ui.inputtype.addEventListener("compositionstart", () => { composing = true; });
ui.inputtype.addEventListener("compositionend", () => {
  composing = false;
  ui.inputtype.value = raw;
  feedback("日本語入力をオフにして、半角英字で入力してください。", true);
});
ui.inputtype.addEventListener("blur", () => {
  if (phase === "running") feedback("入力欄を選択すると練習を続けられます。");
});

if (!spellings.length) {
  ui.startbtn.disabled = true;
  feedback("入力判定を読み込めませんでした。ページを開き直してください。", true);
}
