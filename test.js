"use strict";
const assert = require("node:assert/strict");
const m = require("./shikimori-to-animego.user.js");
const input = [
  { target_type:"Anime", target_title:"Sousou no Frieren", status:"watching", score:9, episodes:13 },
  { target_type:"Anime", target_title:"Bocchi the Rock!", status:"completed", score:10 },
  { target_type:"Manga", target_title:"Manga should be skipped", status:"completed" },
  { target_type:"Anime", target_title:"A", status:"planned", score:0 },
  { target_type:"Anime", target_title:"B", status:"on_hold" },
  { target_type:"Anime", target_title:"C", status:"dropped" },
  { target_type:"Anime", target_title:"D", status:"rewatching" }
];
const p = m.parseList(JSON.stringify(input));
assert.equal(p.items.length, 6);
assert.deepEqual(p.items.map(i=>i.status),["watching","completed","planned","on_hold","dropped","rewatching"]);
assert.equal(p.items[0].episodes,13);
assert.equal(p.items[0].score,9);
assert.equal(m.clean("  Ёж-Ёж  "), "еж еж");
const row = p.items[0];
const exact = {id:"2430",title:"Провожающая в последний путь Фрирен",original:"Sousou no Frieren"};
assert.equal(m.confidence(row,exact),1);
assert.equal(m.choose(row,[exact]).chosen,"2430");
assert.equal(m.choose(row,[exact,{...exact,id:"9999"}]).chosen,"");
assert.equal(m.choose(row,[{id:"123",title:"Something Different",original:"Other Title"}]).chosen,"");
assert.throws(()=>m.parseList("{}"),/JSON/);
assert.equal(m.statusOf("on_hold"),"on_hold");
assert.equal(m.statusOf("Смотрю"),"watching");
console.log("PASS: import structure, statuses, normalization, ranking, ambiguous title protection");
