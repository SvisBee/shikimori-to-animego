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
assert.equal(m.statuses.watching, "watching");
assert.equal(m.statuses.on_hold, "onhold");
assert.equal(m.statuses.planned, "planned");
assert.equal(m.statuses.completed, null);
assert.equal(m.statuses.rewatching, null);
console.log("PASS: anime-go.org mapping and unsupported statuses protected");
const kaguya0={title:'Kaguya-sama wa Kokurasetai: Tensai-tachi no Renai Zunousen',russian:''};
const kaguyaCandidates=[
 {id:'2447',title:'Госпожа Кагуя: в любви как на войне 2 сезон',original:'Kaguya-sama wa Kokurasetai? Tensai-tachi no Renai Zunousen',href:'/anime/kaguya-sama-2447'},
 {id:'2831',title:'Госпожа Кагуя: в любви как на войне',original:'Kaguya-sama wa Kokurasetai: Tensai-tachi no Renai Zunousen',href:'/anime/kaguya-sama-2831'}
];
assert.equal(m.confidence(kaguya0,kaguyaCandidates[0]),0.84);
assert.equal(m.confidence(kaguya0,kaguyaCandidates[1]),1);
assert.equal(m.choose(kaguya0,kaguyaCandidates).chosen,'2831');
const sampleReport={version:1,items:[{sourceIndex:0,title:kaguya0.title,russian:'',status:'completed',score:9,episodes:12,candidates:kaguyaCandidates,chosen:'',result:'pending'}, {sourceIndex:1,title:'World Trigger',russian:'',status:'dropped',score:0,episodes:0,candidates:[{id:'4133',title:'Импульс мира',original:'World Trigger',href:'/anime/world-trigger-4133'}],chosen:'',result:'pending'}],skipped:[]};
const restored=m.parseReport(sampleReport);
assert.equal(restored.items.length,2);
assert.equal(restored.items[0].chosen,'');
assert.equal(restored.items[1].chosen,'4133');
assert.equal(restored.items[1].status,'dropped');
assert.throws(()=>m.parseReport({version:2,items:[]}),/JSON/);
assert.throws(()=>m.parseReport({version:1,items:[{sourceIndex:0,title:'Bad',status:'dropped',candidates:[{id:'12',href:'https://malicious.test',title:'X',original:'X'}]}]}),/ссылк/);
console.log('PASS: unique punctuation-aware matching and safe cached-report restore');
assert.equal(m.eligible({status:"completed",score:8}),false);
assert.equal(m.eligible({status:"completed",score:0}),false);
assert.equal(m.eligible({status:"dropped",score:0}),true);
assert.equal(m.eligible({status:"rewatching",score:10}),false);
assert.equal(m.animePathMatches("/anime/akudama-drayv-2340","2340"),true);
assert.equal(m.animePathMatches("/anime/akudama-drayv-2340","234"),false);
assert.equal(m.animePathMatches("/anime/akudama-drayv-12340","2340"),false);
assert.equal(m.animePathMatches("https://malicious.org/anime/x-2340","2340"),false);
assert.equal(m.parseReport(sampleReport).items[0].chosen,"");
console.log("PASS: completed safely disabled after real-world verification; ID paths validated");
