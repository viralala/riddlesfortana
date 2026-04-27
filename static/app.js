// ── CONFIG ────────────────────────────────────────────────────────
var MASTER_ANSWER  = "viralmaster";
var ADMIN_PASSWORD = "viral2830";

// ── FIREBASE REALTIME SYNC ────────────────────────────────────────
var API_BASE = "";
var fbSessionKey = null;

function apiFetch(path, options){
  options = options || {};
  options.headers = Object.assign({ "Content-Type": "application/json" }, options.headers || {});
  if(options.body && typeof options.body !== "string"){
    options.body = JSON.stringify(options.body);
  }
  return fetch(API_BASE + path, options).then(function(r){
    return r.json().then(function(data){
      if(!r.ok){ throw data; }
      return data;
    });
  });
}

function fbSet(path, data){
  apiFetch("/api/firebase/set", { method:"POST", body:{ path:path, data:data } }).catch(function(){});
}

function fbPush(path, data){
  apiFetch("/api/firebase/push", { method:"POST", body:{ path:path, data:data } }).catch(function(){});
}

function fbGet(path, cb){
  apiFetch("/api/firebase/get?path=" + encodeURIComponent(path))
    .then(function(d){ cb(d); })
    .catch(function(){ cb(null); });
}

function initFbSession(){
  var stored = localStorage.getItem('rmtFbSession');
  if(stored){ fbSessionKey = stored; }
  else {
    fbSessionKey = 'sess_' + Date.now() + '_' + Math.random().toString(36).slice(2,7);
    localStorage.setItem('rmtFbSession', fbSessionKey);
  }
  apiFetch("/api/session/start", { method:"POST", body:{ session_key:fbSessionKey } }).catch(function(){});
}

var _lastCommandTs = 0;
function pollAdminCommands(){
  if(!fbSessionKey) return;
  fbGet('/commands/' + fbSessionKey, function(cmd){
    if(!cmd || !cmd.ts || cmd.ts <= _lastCommandTs) return;
    _lastCommandTs = cmd.ts;
    if(cmd.type === 'grant_life'){
      lives = Math.min(3, lives + (cmd.lives||1));
      renderHearts(); pulseHearts(); saveState(); fbSyncState();
      addSpectateLog('Admin granted +' + (cmd.lives||1) + ' life remotely');
    } else if(cmd.type === 'jump_riddle'){
      current = cmd.riddle || 0;
      loadRiddle(current); saveState();
    } else if(cmd.type === 'unlock_hint'){
      unlockedHints.add(cmd.riddle);
      saveState(); loadRiddle(current);
    }
    // Clear command after processing
    fbSet('/commands/' + fbSessionKey, null);
  });
}
// Poll for admin commands every 3 seconds
setInterval(pollAdminCommands, 3000);

function fbSyncState(){
  if(!fbSessionKey) return;
  if(typeof RIDDLES === 'undefined' || !RIDDLES) return;
  var r = RIDDLES[current] || {};
  fbSet('/live/' + fbSessionKey, {
    riddleNum:      current + 1,
    riddleDiff:     r.diff || '',
    lives:          lives,
    progress:       Math.round((current / RIDDLES.length) * 100),
    completedCount: completedRiddles.size,
    gameMode:       gameMode || 'normal',
    updatedAt:      Date.now()
  });
}

function fbPushGuess(type, riddleNum, diff, guessText){
  if(!fbSessionKey) return;
  apiFetch("/api/guess", {
    method:"POST",
    body:{
      session_key: fbSessionKey,
      type:        type,
      riddle_num:  riddleNum,
      diff:        diff,
      guess:       guessText,
      pack:        activePack || "classic",
      ts:          Date.now()
    }
  }).catch(function(){});
}

var fbAdminListeners = {};
function fbAdminSubscribeLive(cb){
  fbAdminUnsubscribe();
  fbAdminListeners._poll = setInterval(function(){
    fbGet('/live', cb);
  }, 2000);
  fbGet('/live', cb);
}
function fbAdminSubscribeGuesses(sessionKey, cb){
  if(fbAdminListeners._guessPoll) clearInterval(fbAdminListeners._guessPoll);
  fbAdminListeners._guessPoll = setInterval(function(){
    fbGet('/guesses/' + sessionKey, cb);
  }, 1500);
  fbGet('/guesses/' + sessionKey, cb);
}
function fbAdminUnsubscribe(){
  if(fbAdminListeners._poll)      clearInterval(fbAdminListeners._poll);
  if(fbAdminListeners._guessPoll) clearInterval(fbAdminListeners._guessPoll);
  fbAdminListeners = {};
}

initFbSession();


// ── CODE GENERATOR ────────────────────────────────────────────────
function genCode(len){
  var chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  var s = '';
  for(var i=0;i<len;i++) s += chars[Math.floor(Math.random()*chars.length)];
  return s;
}

// ── SECRET CODES ─────────────────────────────────────────────────
var LIFE_CODES_BASE = {
  "VIRAL001":{ lives:1, type:"life" },
  "TALL007": { lives:1, type:"life" },
  "DARE420": { lives:2, type:"life" },
  "CAMROLL": { lives:1, type:"life" },
  "RING911": { lives:2, type:"life" },
  "STARE99": { lives:1, type:"life" },
  "ROASTME": { lives:1, type:"life" },
  "PANDA22": { lives:1, type:"life" },
  "TANA100": { lives:3, type:"life" }
};

function loadOrGenHintCodes(){
  var stored = localStorage.getItem('rmtHintCodes');
  if(stored){ try{ return JSON.parse(stored); }catch(e){} }
  var codes = {}, used = new Set();
  for(var i=0;i<12;i++){
    var code;
    do { code = genCode(7); } while(used.has(code));
    used.add(code);
    codes[code] = { riddle:i, type:'hint' };
  }
  localStorage.setItem('rmtHintCodes', JSON.stringify(codes));
  return codes;
}

var HINT_CODES   = loadOrGenHintCodes();
var SECRET_CODES = Object.assign({}, LIFE_CODES_BASE, HINT_CODES);

// ── PERSISTENT STATE ──────────────────────────────────────────────
function getCurrentScreenId(){
  var hub = document.querySelector('.home-hub.active');
  if(hub) return hub.id;
  var scr = document.querySelector('.screen.active');
  if(scr) return scr.id;
  return 'screenHero';
}

function saveState(){
  localStorage.setItem('rmtState', JSON.stringify({
    lives:            lives,
    current:          current,
    gameMode:         gameMode,
    usedCodes:        Array.from(usedCodes),
    unlockedHints:    Array.from(unlockedHints),
    completedRiddles: Array.from(completedRiddles),
    startTime:        startTime,
    totalElapsed:     totalElapsed,
    gameScreen:       getCurrentScreenId()
  }));
}

function loadState(){
  var raw = localStorage.getItem('rmtState');
  if(!raw) return null;
  try{ return JSON.parse(raw); }catch(e){ return null; }
}

var usedCodes        = new Set();
var unlockedHints    = new Set();
var completedRiddles = new Set();

// ── TASKS ─────────────────────────────────────────────────────────
var TASKS = [
  { icon:"📸", name:"Send Viral a selfie right now",          desc:"Take it immediately. No retakes. No filters. Send it.",                                                             reward:"+1 heart", lives:1, claimed:false },
  { icon:"👑", name:"Tell Viral he is tall and great",         desc:"Message him those exact words. Screenshot sent to Viral as proof.",                                               reward:"+1 heart", lives:1, claimed:false },
  { icon:"🎙", name:"Iran war dare",                           desc:"Walk up to a stranger and casually start a conversation about the Iran war. Record it.",                           reward:"+2 hearts", lives:2, claimed:false },
  { icon:"👁", name:"Sustained eye contact dare",              desc:"Make unbroken eye contact with the nearest person for 10 full seconds. Record the reaction.",                     reward:"+1 heart", lives:1, claimed:false },
  { icon:"📣", name:"Fake announcement dare",                  desc:"Stand up, clear your throat loudly, say I have something important to say then sit down and say nothing.",        reward:"+1 heart", lives:1, claimed:false },
  { icon:"🫣", name:"Camera roll screenshot",                  desc:"Send Viral a screenshot of your 9 most recent photos. No deleting anything first.",                               reward:"+1 heart", lives:1, claimed:false },
  { icon:"📞", name:"Call Viral cold no warning",              desc:"Call him now. When he answers say I needed a lifeline and hang up immediately.",                                  reward:"+2 hearts", lives:2, claimed:false },
  { icon:"🗣", name:"Tell a terrible pun to a stranger",       desc:"Walk up to someone and say: I am reading a book about anti-gravity. It is impossible to put down.",              reward:"+1 heart", lives:1, claimed:false },
  { icon:"🎭", name:"Dramatic menu reading",                   desc:"Pick up any menu and read three items out loud like a Shakespearean monologue. Full commitment.",                 reward:"+1 heart", lives:1, claimed:false },
  { icon:"🤌", name:"Compliment a strangers shoes",            desc:"Walk up to a random person and say Excuse me, those shoes are incredible completely sincerely.",                  reward:"+1 heart", lives:1, claimed:false },
  { icon:"🧘", name:"60-second plank in public",               desc:"Drop to a plank wherever you are right now. Hold it for 60 seconds. Send proof to Viral.",                       reward:"+1 heart", lives:1, claimed:false },
  { icon:"📦", name:"Ask a stranger an absurd question",       desc:"Ask the nearest stranger: Do you know how many golf balls fit in a school bus? Completely seriously.",            reward:"+2 hearts", lives:2, claimed:false }
];

var HINT_TASKS = [
  { icon:"🤳", name:"Send Viral a dramatic I give up video", desc:"Full commitment. Oscar-worthy. Send it. He will give you a nudge.",              reward:"Unlock hint", claimed:false },
  { icon:"🦆", name:"Do your best duck impression",          desc:"Record yourself for at least 5 seconds. Viral decides if it is good enough.",   reward:"Unlock hint", claimed:false },
  { icon:"📝", name:"Write Viral a formal complaint letter", desc:"Dear Viral, Re: Unfair Difficulty... If it is funny enough, you get a hint.",   reward:"Unlock hint", claimed:false },
  { icon:"🎪", name:"Send Viral three guesses you tried",    desc:"Voice note with your reasoning. He will say if you are on the right track.",    reward:"Unlock hint", claimed:false },
  { icon:"🧢", name:"Say riddle me this to someone",         desc:"Just those three words. To a real person. Film the look on their face.",        reward:"Unlock hint", claimed:false },
  { icon:"🙈", name:"Send your current facial expression",   desc:"Right now. No filter. Your actual stuck-on-a-riddle face.",                    reward:"Unlock hint", claimed:false }
];

// ── RIDDLES ───────────────────────────────────────────────────────
var RIDDLES_CLASSIC = [
  {
    diff:"Lateral", diffClass:"extreme",
    body:'<div class="scene-block"><div class="scene-label">Case File</div><div class="scene-text">A man is found dead in the middle of an open field. He is lying face-down. No tracks of any kind lead to or from the body. No footprints, no tyre marks, nothing. There are no wounds except a single broken pack on his back.</div></div><div class="evidence-list"><div class="evidence-item">The field is completely flat and undisturbed in every direction.</div><div class="evidence-item">The man is wearing all black, head to toe.</div><div class="evidence-item">There are no other people, animals, or vehicles anywhere near the scene.</div><div class="evidence-item">The broken pack is the only item on or near his body.</div></div>',
    question:"No murder. No accident involving anyone else. The answer is singular and specific. <strong>What happened to him?</strong>",
    answers:["parachute","parachute failed","parachute didnt open","his parachute didnt open","failed parachute","parachute malfunction","the parachute","skydiving","parachute pack"],
    hint:"Nothing on the ground tells you what happened. Look upward.",
    explain:"He was a skydiver. His parachute pack failed to open. Because he fell from altitude, no footprints or tracks led to his body. The all-black clothing and isolated field are red herrings."
  },
  {
    diff:"Murder", diffClass:"murder",
    body:'<div class="scene-block"><div class="scene-label">The Scene</div><div class="scene-text">Marcus Webb is found murdered in his study on a Tuesday afternoon. The room was locked from the inside. His personal calendar lies open on his desk. Before dying, he managed to circle four dates in red ink:<br/><br/><strong style="color:var(--accent2);font-size:20px;letter-spacing:0.1em">6 &nbsp; 4 &nbsp; 9 &nbsp; 10</strong></div></div><div class="suspect-grid"><div class="suspect-card"><div class="suspect-name">Victoria Ash</div><div class="suspect-detail">Business partner. Was in a board meeting until 3pm.</div></div><div class="suspect-card"><div class="suspect-name">Jason Carver</div><div class="suspect-detail">Personal assistant. Says he never entered the study.</div></div><div class="suspect-card"><div class="suspect-name">Donald Fitch</div><div class="suspect-detail">Neighbour. Claims he was gardening all day.</div></div><div class="suspect-card"><div class="suspect-name">Neil Barrow</div><div class="suspect-detail">Accountant. Was auditing files in the next room.</div></div></div>',
    question:"Marcus left one final message. The police decoded it immediately. <strong>Who killed Marcus?</strong>",
    answers:["jason","jason carver"],
    hint:"A calendar has more than numbers. What else does every date carry?",
    explain:"The circled dates 6, 4, 9, 10 correspond to the 6th, 4th, 9th, and 10th months. June=6, April=4, September=9, October=10. But the key is the first letters: J-A-S-O... and the 10th month is October... wait — actually 6=J(une), 4=A(pril), 9=S(ept), 10=O(ct) — spells J-A-S-O. The final N: none needed. The killer's first name starts with those month initials. Jason Carver killed him."
  },
  {
    diff:"Deduction", diffClass:"labyrinth",
    body:'<div class="scene-block"><div class="scene-label">Known Facts</div><div class="scene-text">Five people: <strong style="color:var(--accent2)">Dan, Mike, Jeff, Ben, Jack.</strong> One of them committed the murder.</div></div><div class="evidence-list"><div class="evidence-item">Dan ran a full marathon yesterday with one of the other four, confirmed by race records.</div><div class="evidence-item">The killer had their right leg surgically amputated three weeks before the murder.</div><div class="evidence-item">Jeff has a confirmed appointment to set up Ben\'s home office equipment next Thursday.</div><div class="evidence-item">Jack has not left his apartment or spoken to anyone since the incident.</div><div class="evidence-item">The killer is Jack\'s biological brother. Jack confirmed this to police.</div><div class="evidence-item">Ben told detectives he had never met Jack before six months ago.</div></div>',
    question:"Every clue eliminates someone. <strong>Name the killer.</strong>",
    answers:["jeff","jeff is the killer","jeff did it"],
    hint:"One clue eliminates two people at once. Think about what biological brother means alongside never met before six months ago.",
    explain:"The killer is Jack's biological brother. Jack said he had never met Ben before six months ago, so Ben is not the brother. Dan ran a marathon ruling him out. Jack confirmed it was not him. That leaves Jeff."
  },
  {
    diff:"Lateral", diffClass:"extreme",
    body:'<div class="scene-block"><div class="scene-label">The Scenario</div><div class="scene-text">A father and his son are in a devastating car accident. The father dies at the scene. The son is rushed to hospital in critical condition.<br/><br/>The senior surgeon walks in, looks at the boy and says:<br/><br/><em>"I cannot operate on this patient. This is my son."</em></div></div><div class="evidence-list"><div class="evidence-item">The father is confirmed dead at the crash site.</div><div class="evidence-item">There is no stepfather, no adoptive father, no mistake in identification.</div><div class="evidence-item">The surgeon is telling the truth.</div></div>',
    question:"No trick of death, no twins, no error. <strong>How is this possible?</strong>",
    answers:["the surgeon is his mother","mother","his mother","surgeon is the mother","the mother","mom","the surgeon is the boys mother","shes his mother"],
    hint:"The puzzle relies entirely on an assumption you made the moment you read the word surgeon.",
    explain:"The surgeon is the boy's mother. The riddle exploits the subconscious assumption that surgeons are male. The mother is very much alive and standing in the operating room."
  },
  {
    diff:"Murder", diffClass:"murder",
    body:'<div class="scene-block"><div class="scene-label">The Scene</div><div class="scene-text">A ship captain leaves his gold ring on the table beside his bunk. He is gone for twelve minutes. When he returns, the ring is gone. He questions his three crew members.</div></div><div class="suspect-grid"><div class="suspect-card"><div class="suspect-name">The Cook</div><div class="suspect-detail">I have not left the galley. Been preparing tonight\'s meal without interruption.</div></div><div class="suspect-card"><div class="suspect-name">The Engineer</div><div class="suspect-detail">I was below in the engine room the whole time. Did not come up once.</div></div><div class="suspect-card"><div class="suspect-name">The Deckhand</div><div class="suspect-detail">I was up on the mast. Someone had flown the flag upside down and I was correcting it.</div></div></div><div class="evidence-list"><div class="evidence-item">The ship\'s registry, flag, and papers are all Japanese.</div></div>',
    question:"The captain arrested one crew member on the spot. <strong>Who, and why is their alibi physically impossible?</strong>",
    answers:["deckhand","the deckhand","deckhand lied","the deckhand lied","japanese flag","flag","flag is symmetrical","japanese flag has no upside down","you cant flip the japanese flag","flag looks the same upside down"],
    hint:"Consider whether the flag in question is capable of being wrong.",
    explain:"The Japanese flag is a plain white rectangle with a single red circle in the centre. It is perfectly symmetrical. There is no upside down. The deckhand's alibi is physically impossible, so he was lying and was in the captain's cabin."
  },
  {
    diff:"Paradox", diffClass:"extreme",
    body:'<div class="scene-block"><div class="scene-label">The Sentence</div><div class="scene-text">A condemned man stands before a judge who offers him a chance to speak a single sentence. The judge declares:<br/><br/><em>"If your sentence is true, you will be shot. If your sentence is false, you will be hanged."</em><br/><br/>The man speaks. The judge stares at him for a long moment and lets him go. The court cannot carry out either sentence.</div></div>',
    question:"The man's sentence creates a logical trap neither punishment can escape. <strong>What does he say?</strong>",
    answers:["you will hang me","i will be hanged","you are going to hang me","you will hang me not shoot me"],
    hint:"Whatever the court decides to do, doing it proves itself wrong.",
    explain:"The man says: You will hang me. If the court hangs him, his sentence was true but true earns a shooting. If the court shoots him, his sentence was false but false earns a hanging. Either action violates the judge's own terms."
  },
  {
    diff:"Lateral", diffClass:"extreme",
    body:'<div class="scene-block"><div class="scene-label">Case File</div><div class="scene-text">A man is found hanging from the rafters in a completely bare room. The ceiling is 14 feet high. The floor is dry concrete except for a damp patch directly beneath his feet. The door was bolted from the inside. The window was latched shut from the inside. No object of any kind was found in the room.</div></div><div class="evidence-list"><div class="evidence-item">Forensics confirmed no other person had been in the room.</div><div class="evidence-item">It is August. Outside temperature: 34 degrees Celsius.</div><div class="evidence-item">The damp patch is the exact size and shape of a large rectangular block.</div><div class="evidence-item">Time of death was estimated 3 to 4 hours before discovery.</div></div>',
    question:"How he reached the rafters and what the damp patch is are the same answer. <strong>What was it?</strong>",
    answers:["ice","block of ice","a block of ice","ice block","stood on ice","melted ice"],
    hint:"The damp patch has a shape. Shapes imply former objects.",
    explain:"He stood on a large block of ice, looped the rope over the rafters, and waited. In August heat the ice melted beneath him, leaving only a damp rectangular patch. Every trace of what he stood on had evaporated by the time the body was found."
  },
  {
    diff:"Deduction", diffClass:"labyrinth",
    body:'<div class="scene-block"><div class="scene-label">The Scene</div><div class="scene-text">A man is found dead at his desk, a gun on the floor beside him. An analogue tape recorder sits on the desk, tape wound back to the very beginning. The detective presses play.<br/><br/>A voice confirmed as the deceased says: <em>"I have nothing left. I am ending it now."</em> A gunshot. Then silence.</div></div><div class="evidence-list"><div class="evidence-item">The door was locked from the inside.</div><div class="evidence-item">No other fingerprints were found in the room.</div><div class="evidence-item">One bullet had been fired from the gun.</div><div class="evidence-item">The voice on the tape has been authenticated as the victim\'s.</div><div class="evidence-item">The tape was a standard analogue cassette. No digital editing was possible.</div></div>',
    question:"The detective declared it a homicide before leaving the room. <strong>State the single reason why suicide is impossible here.</strong>",
    answers:["rewound","tape was rewound","someone rewound the tape","who rewound","tape rewound to start","tape at beginning","tape at the start","the tape was at the beginning","no one to rewind","he couldnt rewind it after shooting himself","dead man cant rewind"],
    hint:"A dead man's hands do not move.",
    explain:"The tape was wound all the way back to the beginning. If the man truly shot himself while recording, the tape would have stopped mid-recording. For it to be rewound to the start, someone had to rewind it after the shot. A dead man cannot rewind a tape."
  },
  {
    diff:"Murder", diffClass:"murder",
    body:'<div class="scene-block"><div class="scene-label">The Scene</div><div class="scene-text">A woman hosts her closest friend for dinner. The menu: braised lamb, roasted vegetables, and a single apple sliced in half at the table with a kitchen knife. One half given to the guest with cream, the other eaten plain by the host. The cream came from a shared bowl.<br/><br/>By 2am, the guest is dead. Cause of death: acute poisoning.</div></div><div class="evidence-list"><div class="evidence-item">The lamb and vegetables tested clean. Both women consumed them.</div><div class="evidence-item">The apple was purchased sealed and uncut. Both halves were from the same fruit.</div><div class="evidence-item">The cream tested clean. Both women ate from the same bowl.</div><div class="evidence-item">No other substance was ingested by either woman during the meal.</div></div>',
    question:"Every possible vector has been eliminated and yet the host is guilty. <strong>What delivered the poison?</strong>",
    answers:["the knife","knife","poisoned knife","knife was poisoned","poison on the knife","blade","the blade","the blade was poisoned"],
    hint:"Everything consumed has been cleared. The poison entered through something that touched the food, not through the food itself.",
    explain:"The host coated one side of the kitchen knife blade with poison before slicing the apple. When she cut the apple in half, the poison transferred onto the guest's half only. The host ate the uncoated half and survived."
  },
  {
    diff:"Multi-Stage", diffClass:"labyrinth",
    body:'<div class="scene-block"><div class="scene-label">Statement I</div><div class="scene-text">I never was, am always to be. No one has ever seen me, nor ever will. Yet I am the confidence of all who live and breathe on this terrestrial ball.</div></div><div class="scene-block"><div class="scene-label">Statement II</div><div class="scene-text">The man who made it did not want it. The man who bought it did not use it. The man who used it did not know it.</div></div><div class="scene-block"><div class="scene-label">Statement III</div><div class="scene-text">I have cities, but no houses live there. I have mountains, but no trees grow there. I have water, but no fish swim there. I have roads, but no cars drive there.</div></div><div class="divider"></div>',
    question:"Three statements. Each is a separate riddle. <strong>Answer all three, separated by commas.</strong>",
    answers:["tomorrow a coffin a map","tomorrow coffin map","tomorrow, a coffin, a map","tomorrow, coffin, map","coffin tomorrow map","map coffin tomorrow"],
    hint:"Do not look for a connection between them. They are three separate locks.",
    explain:"Statement I: Tomorrow. Statement II: A coffin, the carpenter did not want it for himself, the buyer never used it personally, the occupant had no idea. Statement III: A map, it has cities, mountains, water, and roads drawn on it but none exist physically on the paper."
  },
  {
    diff:"Murder", diffClass:"murder",
    body:'<div class="scene-block"><div class="scene-label">Witness Statement</div><div class="scene-text">A man named Evan arrives at a beach house in California and calls the police. He says he lent the property to his colleague Liam while he spent the past four weeks on a work assignment in Argentina. He returned directly from Buenos Aires this morning and found Liam dead inside.</div></div><div class="evidence-list"><div class="evidence-item">Liam was killed approximately 48 hours prior to discovery.</div><div class="evidence-item">Evan\'s passport confirms an Argentine entry stamp four weeks ago.</div><div class="evidence-item">Evan has a pronounced, even tan across his face, neck, and forearms.</div><div class="evidence-item">The detective arrested Evan without further questioning.</div></div>',
    question:"The detective said nothing. He simply looked at Evan and knew. <strong>What gave Evan away?</strong>",
    answers:["tan","suntan","the tan","the suntan","argentina is winter","its winter in argentina","southern hemisphere is winter","winter in argentina","you cant get a tan in argentina in winter","argentina winter no tan","tan proves he wasnt in argentina","he lied","evan lied about argentina"],
    hint:"The passport is real. The alibi is not. Something on Evan's body tells you where he actually was.",
    explain:"Argentina is in the Southern Hemisphere. When it is summer in California, it is winter in Buenos Aires. Evan claimed four weeks there but arrived with a deep even tan. You cannot get a tan like that during an Argentine winter. His story is a lie."
  },
  {
    diff:"Final", diffClass:"final",
    body:'<div class="scene-block"><div class="scene-label">I</div><div class="scene-text">The more of me you take, the more you leave behind, and yet you carry me everywhere regardless.</div></div><div class="scene-block"><div class="scene-label">II</div><div class="scene-text">I was assigned before you had any say. I follow you into every room, introduced before you speak, remembered after you leave. The people who love you say me most. You say me least.</div></div><div class="scene-block"><div class="scene-label">III</div><div class="scene-text">Decode this and you have it: the 20th, the 1st, the 14th, the 1st.</div></div>',
    question:"Three layers to peel. One thing waiting underneath all of them. <strong>What is it?</strong>",
    answers:["tana","your name","name"],
    hint:"III is not decorative.",
    explain:"Layer I: footsteps, the more you take, the more you leave behind. Layer II: your name, assigned at birth, said by others more than yourself. Layer III: the 20th letter is T, the 1st is A, the 14th is N, the 1st is A again, spelling TANA."
  }
];


// ── HARRY POTTER PACK ─────────────────────────────────────────────
var RIDDLES_HP = [

  // ── SET 1: INVESTIGATION ──────────────────────────────────────────

  {
    diff:"Hard", diffClass:"hp",
    body:'<div class="scene-block"><div class="scene-label">🧊 The Frozen Auror</div><div class="scene-text">An Auror is discovered completely rigid in the shadowy aisles of Borgin and Burkes. Assuming a dark artefact is responsible, St. Mungo\'s Healers immediately administer a perfectly brewed Mandrake Restorative Draught. Hours pass — the Auror remains completely frozen.</div></div><div class="evidence-list"><div class="evidence-item">A shattered, highly cursed silver mirror lies on the floor near the Auror\'s feet.</div><div class="evidence-item">The Healers verified the Mandrakes were fully mature, chopped, and stewed correctly.</div><div class="evidence-item">The Auror\'s arms are snapped violently tight to their sides and their legs are locked together.</div></div>',
    question:"Why did the Mandrake Restorative Draught fail to cure the Auror?",
    answers:["body bind","body-bind","full body bind","full body-bind","petrificus totalus","not petrified","its a curse","body bind curse","petrificus","not basilisk","curse not petrification","finite incantatem","bodybind"],
    hint:"The shattered mirror is a red herring. Look at the Auror\'s exact physical position — what first-year spell snaps someone\'s arms and legs together like a board?",
    explain:"It was the Body-Bind Curse (Petrificus Totalus), not petrification. The Mandrake Restorative Draught only cures petrification caused by creatures like Basilisks. A spell-based full body bind requires a countercurse — Finite Incantatem — not a potion. The shattered mirror was a deliberate misdirect."
  },

  {
    diff:"Hard", diffClass:"hp",
    body:'<div class="scene-block"><div class="scene-label">🦎 The Unseen Thief</div><div class="scene-text">A wizard is on trial for stealing a prized Demiguise from a magically sealed enclosure. His defence: <em>"I wore a flawless Demiguise-hair Invisibility Cloak, snuck in completely undetected, picked the lock silently with Muggle tools, and snatched the beast while it was calmly eating."</em></div></div><div class="evidence-list"><div class="evidence-item">Investigators confirmed the lock was picked with Muggle tools — no magical trace triggered.</div><div class="evidence-item">The Invisibility Cloak was tested and proven to hide all visual traces absolutely.</div><div class="evidence-item">The Demiguise was docile and eating its favourite food right before the theft.</div></div>',
    question:"What proves the suspect\'s flawless stealth story is a lie?",
    answers:["demiguise can see the future","demiguise sees future","precognition","future sight","sees the future","demiguise precognitive","it would have known","demiguise future","demiguises see future"],
    hint:"The cloak hides the thief visually — but Demiguises possess a second magical sense entirely. How are they normally captured in the wild?",
    explain:"Demiguises can see the future. A perfectly planned, methodical heist is exactly what their precognitive vision would show them in advance. The creature would have known the thief was coming, finished eating, and fled long before they arrived. The only way to catch a Demiguise is to act completely unpredictably — which a meticulous weeks-long plan is not."
  },

  {
    diff:"Hard", diffClass:"hp",
    body:'<div class="scene-block"><div class="scene-label">🧠 The Honest Vault Breaker</div><div class="scene-text">A suspected Gringotts thief is captured and given three drops of perfectly brewed Veritaserum. Under the potion\'s influence, they state blankly: <em>"I have never been inside that vault."</em> Goblins later produce unforgeable magical security footage proving the suspect absolutely emptied the vault.</div></div><div class="evidence-list"><div class="evidence-item">The Veritaserum was clear, odourless, and brewed by a Master Potioneer.</div><div class="evidence-item">The suspect had taken no antidotes and was not an Occlumens — fully under the potion\'s effect.</div><div class="evidence-item">The suspect\'s wand registered a recent casting of the Obliviate charm prior to capture.</div></div>',
    question:"Why did the suspect speak a falsehood under Veritaserum?",
    answers:["obliviated themselves","erased their own memory","memory charm","obliviate","self obliviate","cast obliviate on themselves","deleted the memory","removed their memory","modified their memory","memory erased"],
    hint:"Veritaserum forces people to say what they genuinely believe to be true — not what is objectively true. The wand log is the critical clue.",
    explain:"The suspect cast Obliviate on themselves after committing the crime, erasing their own memory of the event. Under Veritaserum, they genuinely believed they had never been inside the vault — because they had no memory of it. The potion worked perfectly; it was the memory that was gone."
  },

  {
    diff:"Hard", diffClass:"hp",
    body:'<div class="scene-block"><div class="scene-label">🗺️ The Vanishing Dot</div><div class="scene-text">A student steals boomslang skin from Snape\'s office. Harry tracks them on the Marauder\'s Map — the dot flees to the 7th floor, stops in an empty corridor, paces back and forth exactly three times, and then vanishes entirely from the map.</div></div><div class="evidence-list"><div class="evidence-item">The Marauder\'s Map never fails to show the true identity and location of anyone within Hogwarts.</div><div class="evidence-item">The thief did not Apparate, use a Portkey, or leave the grounds — all blocked by the castle\'s enchantments.</div><div class="evidence-item">Harry rushes to the exact corridor. It is completely empty. No secret passages appear on the map nearby.</div></div>',
    question:"Where did the pacing thief hide?",
    answers:["room of requirement","the room of requirement","room of requirement hides from map","map cant see room of requirement","map blind spot","room cant be seen on map"],
    hint:"Why would someone pace back and forth exactly three times in a specific 7th-floor corridor? And why would the map suddenly lose them there?",
    explain:"The thief entered the Room of Requirement. Pacing three times while thinking of a specific need is exactly how the room is summoned. The Marauder\'s Map cannot see inside the Room of Requirement — it is the map\'s one famous blind spot. Once inside, the dot simply disappears."
  },

  {
    diff:"Hard", diffClass:"hp",
    body:'<div class="scene-block"><div class="scene-label">⏱️ The Imposter\'s Alibi</div><div class="scene-text">An imposter breaches the Ministry disguised as a senior Auror using Polyjuice Potion. When caught, they boast: <em>"I heard about the mission on Sunday. I picked the Fluxweed at the full moon on Monday night, brewed the potion overnight, and drank it Tuesday at dawn. Perfect."</em></div></div><div class="evidence-list"><div class="evidence-item">Fluxweed must be picked at the full moon to be effective in Polyjuice Potion — confirmed.</div><div class="evidence-item">The transformation was visually perfect and the voice matched exactly.</div><div class="evidence-item">The imposter claims the entire brewing process took under 12 hours.</div></div>',
    question:"What exposes the imposter\'s timeline as completely impossible?",
    answers:["lacewing flies","lacewing flies take 21 days","21 days","lacewings","bicorn horn","boomslang skin","month to brew","one month","polyjuice takes a month","cannot brew overnight","takes weeks"],
    hint:"Fluxweed timing is correct — but Polyjuice Potion has another ingredient that requires a very specific, lengthy preparation. How long does the full potion actually take?",
    explain:"Polyjuice Potion takes a minimum of one month to brew. The lacewing flies alone must be stewed for 21 days. No matter when the Fluxweed is picked, the potion cannot be completed in 12 hours. The imposter\'s own boast proves their story is impossible."
  },

  // ── SET 2: DARK ARTS ──────────────────────────────────────────────

  {
    diff:"Hard", diffClass:"murder",
    body:'<div class="scene-block"><div class="scene-label">☠️ The Starving Dementor</div><div class="scene-text">A notorious dark wizard is captured in a graveyard and sentenced to the Dementor\'s Kiss in Azkaban. Bound to a chair, the Dementor lowers its hood, clamps its jaws over the wizard\'s mouth, and inhales deeply — then abruptly recoils in frustration and glides away. The wizard remains completely conscious.</div></div><div class="evidence-list"><div class="evidence-item">The dark wizard is extremely cold to the touch and possesses milky, unblinking eyes.</div><div class="evidence-item">The prisoner has not moved, flinched, or spoken a single word since being discovered in the graveyard.</div><div class="evidence-item">The Dementor\'s Kiss is specifically designed to consume a human soul.</div></div>',
    question:"Why did the Dementor fail to consume a soul?",
    answers:["inferi","inferius","its an inferius","not human","no soul","inferi have no soul","its inferi","animated corpse","reanimated corpse","zombie","undead"],
    hint:"The trap is assuming the wizard used Occlumency or a shield. He has milky eyes, is ice cold, and has not moved at all. What dark creature from graveyards is merely a reanimated corpse?",
    explain:"The wizard is actually an Inferius — a reanimated corpse controlled by dark magic. Inferi are not human and have no soul. The Dementor\'s Kiss requires a human soul to consume. Finding nothing, the Dementor recoiled. The real dark wizard was elsewhere entirely."
  },

  {
    diff:"Hard", diffClass:"murder",
    body:'<div class="scene-block"><div class="scene-label">🕯️ The Absolute Darkness</div><div class="scene-text">A dark artefact smuggler throws Peruvian Instant Darkness Powder in a windowless vault. Lumos and fire spells are completely useless. The smuggler silently tiptoes toward the exit. Yet the pursuing Auror walks directly to the smuggler and captures him without a single misstep.</div></div><div class="evidence-list"><div class="evidence-item">The room is entirely pitch black — even the smuggler cannot see.</div><div class="evidence-item">The Auror cast no detection spells and does not possess a magical eye.</div><div class="evidence-item">The Auror\'s left hand is tightly gripping a shrivelled, severed object holding a lit candle.</div></div>',
    question:"How did the Auror see through the magical darkness?",
    answers:["hand of glory","hand of glory","a hand of glory","the hand","severed hand","hand with candle","glory","used a hand of glory"],
    hint:"Peruvian Instant Darkness Powder defeats normal light magic. But Borgin and Burkes sells one specific macabre object that provides light exclusively to its holder — and plunges everyone else into darkness.",
    explain:"The Auror used a Hand of Glory — a shrivelled severed hand that holds a candle giving light only to the person holding it. Everyone else, including the smuggler, remains in complete darkness. The Peruvian powder actually made the Auror\'s advantage greater, not lesser."
  },

  {
    diff:"Hard", diffClass:"extreme",
    body:'<div class="scene-block"><div class="scene-label">🩸 The Untouchable Death</div><div class="scene-text">A dark wizard hides in a magically sealed, unplottable bunker — completely protected from all curses and intruders. He wears no cursed objects and drinks only conjured water. At exactly 3:00 PM, blood trickles from his nose and he drops dead. Miles away, at the same moment, Aurors successfully burn down his master\'s dark artefact warehouse.</div></div><div class="evidence-list"><div class="evidence-item">The bunker\'s wards were entirely unbreached. No one else was inside.</div><div class="evidence-item">The dead wizard has a faint rope-like silvery scar wrapped tightly around his right hand.</div><div class="evidence-item">He was entirely healthy until the exact second the warehouse burned down.</div></div>',
    question:"What caused the dark wizard\'s sudden death?",
    answers:["unbreakable vow","the vow","broke an unbreakable vow","vow was broken","unbreakable vow broken","swore to protect","broke his vow"],
    hint:"The silvery rope-like scar is not decorative. It is the physical mark of a specific magical contract. What happens to someone who swears an Unbreakable Vow — and then breaks it?",
    explain:"The silvery scar is the binding mark of an Unbreakable Vow the dark wizard swore to protect his master\'s property. When Aurors destroyed the warehouse, the terms of the vow were broken. An Unbreakable Vow kills the person who breaks it instantly — no curse, no intrusion needed."
  },

  {
    diff:"Hard", diffClass:"extreme",
    body:'<div class="scene-block"><div class="scene-label">📿 The Paranoia Pendant</div><div class="scene-text">A curse-breaker steals a heavy silver locket from a dark wizard\'s tomb. Fearing contact curses, he handles it entirely with dragon-hide gloves and wears it on a chain over a thick leather tunic — metal never touching his skin. Despite this, he soon suffers intense paranoia, dark hallucinations, and eventually attempts to murder his partner.</div></div><div class="evidence-list"><div class="evidence-item">His protective gear is expert-grade and completely impermeable.</div><div class="evidence-item">The locket has not been opened. He inhaled no dark powders.</div><div class="evidence-item">The corruption affects only his mind and emotions — growing worse the longer it sits over his chest.</div></div>',
    question:"What kind of dark object is the locket?",
    answers:["horcrux","a horcrux","its a horcrux","soul vessel","contains a soul","part of a soul","fragment of a soul","soul fragment"],
    hint:"The trap is assuming a contact or airborne curse. The corruption requires no skin contact — only proximity to the wearer\'s heart. What extremely dark object houses a fragment of a wizard\'s soul?",
    explain:"The locket is a Horcrux. A Horcrux does not require skin contact to exert its psychological corruption — it influences the wearer purely through proximity to their person, particularly when worn near the heart. No amount of physical shielding protects against the soul fragment\'s corrupting influence."
  },

  {
    diff:"Hard", diffClass:"murder",
    body:'<div class="scene-block"><div class="scene-label">🪲 The Empty Cell</div><div class="scene-text">A dark witch vanishes from a heavily guarded Azkaban cell. Dementors swear no human passed them. Aurors inspect the empty cell — iron bars spaced exactly one inch apart, unbreakable. They find only an ordinary water beetle on the floor. An Auror crushes it under his boot and leaves. The witch is never found.</div></div><div class="evidence-list"><div class="evidence-item">Dementors navigate strictly by sensing human emotions and souls.</div><div class="evidence-item">The witch had no wand. Anti-Apparition jinxes block teleportation entirely.</div><div class="evidence-item">Dementors cannot clearly sense the simplified emotions and souls of animals.</div></div>',
    question:"Why was the escaped dark witch never found?",
    answers:["animagus","the auror crushed the animagus","crushed the witch","beetle was the witch","she was the beetle","animagus transformation","she became a beetle","she transformed into a beetle","squashed the witch","killed her"],
    hint:"The Dementors didn\'t sense a human leaving — because a human didn\'t leave. The beetle is the only unexplained detail. What illegal transformation lets a witch shrink to beetle-size?",
    explain:"The dark witch was an unregistered Animagus who could transform into a water beetle. She transformed, slipped through the one-inch bars, and walked past the Dementors undetected — animals don\'t register as human souls. The Auror who crushed the beetle unknowingly killed her."
  }

];

// Active riddle set based on pack
var RIDDLES = RIDDLES_CLASSIC;

function setActivePack(id){
  activePack = id;
  if(id === 'horror' && typeof RIDDLES_HORROR !== 'undefined')             RIDDLES = RIDDLES_HORROR;
  else if(id === 'harrypotter' && typeof RIDDLES_HP !== 'undefined')       RIDDLES = RIDDLES_HP;
  else                                                                      RIDDLES = RIDDLES_CLASSIC;
}

var CORRECT_MSG = ["There it is.","Correct.","Sharp.","Exactly.","Got it.","Right.","Yes.","Nailed it.","Precise.","Exactly right."];
var WRONG_MSG   = ["No.","Not that.","Think again.","Wrong.","Try again.","Incorrect.","Keep thinking."];

// ── GAME STATE ────────────────────────────────────────────────────
var lives             = 3;
var current           = 0;
var hintOpen          = false;
var gameMode          = 'normal';
var startTime         = null;
var totalElapsed      = 0;
var timedInterval     = null;
var timedSecondsLeft  = 90;
var spectateLog       = [];
var adminUnlocked     = false;

// ── RESTORE STATE ON LOAD ────────────────────────────────────────
(function restoreOnLoad(){
  var s = loadState();
  if(!s) return;
  lives        = s.lives        || 3;
  current      = s.current      || 0;
  gameMode     = s.gameMode     || 'normal';
  startTime    = s.startTime    || null;
  totalElapsed = s.totalElapsed || 0;
  (s.usedCodes        || []).forEach(function(c){ usedCodes.add(c); });
  (s.unlockedHints    || []).forEach(function(h){ unlockedHints.add(h); });
  (s.completedRiddles || []).forEach(function(r){ completedRiddles.add(r); });
  window._restoreScreen = s.gameScreen || 'screenHero';
  window._restoreRiddle = (s.gameScreen === 'screenRiddle') ? current : null;
  selectMode(gameMode);
})();

// ── HEARTS ────────────────────────────────────────────────────────
function renderHearts(){
  var row = document.getElementById('heartsRow');
  row.innerHTML = '';
  for(var i=0;i<3;i++){
    var h = document.createElement('span');
    h.className = 'heart' + (i >= lives ? ' lost' : '');
    h.id = 'heart' + i;
    h.textContent = '♥';
    row.appendChild(h);
  }
}
function pulseHearts(){
  for(var i=0;i<lives;i++){
    (function(idx){
      setTimeout(function(){
        var el = document.getElementById('heart' + idx);
        if(!el) return;
        el.classList.add('pulse');
        setTimeout(function(){ el.classList.remove('pulse'); }, 450);
      }, idx * 100);
    })(i);
  }
}

// ── TIMED MODE ────────────────────────────────────────────────────
var TIMED_SECONDS = 90;

function selectMode(m){
  gameMode = m;
  var mn = document.getElementById('mcNormal');
  var mt = document.getElementById('mcTimed');
  if(mn) mn.classList.toggle('sel', m === 'normal');
  if(mt) mt.classList.toggle('sel', m === 'timed');
}
function selectModeCard(m){ selectMode(m); }

function startTimedCountdown(){
  clearTimedInterval();
  if(gameMode !== 'timed') return;
  timedSecondsLeft = TIMED_SECONDS;
  var badge = document.getElementById('timerBadge');
  badge.style.display = 'flex';
  updateTimerBadge();
  timedInterval = setInterval(function(){
    timedSecondsLeft--;
    updateTimerBadge();
    if(timedSecondsLeft <= 0){
      clearTimedInterval();
      lives--; renderHearts(); saveState();
      showPenalty('Time up! -1 life');
      addSpectateLog('Time ran out on riddle ' + (current+1), 'wrong');
      if(lives <= 0){ setTimeout(function(){ showScreen('screenGameover'); }, 1000); }
      else { setTimeout(function(){ startTimedCountdown(); }, 1100); }
    }
  }, 1000);
}
function clearTimedInterval(){
  if(timedInterval){ clearInterval(timedInterval); timedInterval = null; }
}
function updateTimerBadge(){
  var badge = document.getElementById('timerBadge');
  var m = Math.floor(timedSecondsLeft/60);
  var s = timedSecondsLeft % 60;
  badge.textContent = m + ':' + (s < 10 ? '0' : '') + s;
  badge.className = 'timer-badge running' + (timedSecondsLeft <= 20 ? ' danger' : '');
}
function showPenalty(msg){
  var el = document.createElement('div');
  el.className = 'time-penalty'; el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(function(){ el.remove(); }, 1100);
}

// ── STOPWATCH ─────────────────────────────────────────────────────
function startStopwatch(){ startTime = Date.now(); totalElapsed = 0; }
function getElapsedMs(){
  if(!startTime) return totalElapsed;
  return totalElapsed + (Date.now() - startTime);
}
function formatTime(ms){
  var s  = Math.floor(ms / 1000);
  var m  = Math.floor(s / 60);
  var sc = s % 60;
  return m + 'm ' + (sc < 10 ? '0' : '') + sc + 's';
}

// ── SPECTATOR MODE ────────────────────────────────────────────────
// guessLog stores every attempt: { type, riddleNum, diff, guess, ts }
var guessLog = [];

function addSpectateLog(type, riddleNum, diff, guessText){
  // Legacy calls from gallery/code (type is a plain string message)
  if(typeof riddleNum === 'undefined'){
    guessLog.unshift({ type:'info', msg:type, ts:Date.now() });
  } else {
    guessLog.unshift({ type:type, riddleNum:riddleNum, diff:diff || '', guess:guessText || '', ts:Date.now() });
  }
  if(guessLog.length > 50) guessLog.pop();
  // Also keep backward compat spectateLog for the summary line
  spectateLog.unshift({ msg: type === 'correct'
    ? 'R' + riddleNum + ' solved — "' + (guessText||'') + '"'
    : type === 'wrong'
    ? 'R' + riddleNum + ' wrong — "' + (guessText||'') + '"'
    : type,
    type: (type === 'correct' ? 'correct' : type === 'wrong' ? 'wrong' : '') });
  if(spectateLog.length > 8) spectateLog.pop();
  var overlay = document.getElementById('spectateOverlay');
  if(overlay && overlay.classList.contains('show')) renderSpectateLog();
}
function openSpectate(){
  updateSpectateView();
  document.getElementById('spectateOverlay').classList.add('show');
}
function closeSpectate(){ document.getElementById('spectateOverlay').classList.remove('show'); }
function updateSpectateView(){
  var r = RIDDLES[current];
  document.getElementById('specRiddleNum').textContent = current + 1;
  document.getElementById('specRiddleDiff').textContent = r ? r.diff : '---';
  var sh = document.getElementById('specHearts'); sh.innerHTML = '';
  for(var i=0;i<3;i++){
    var sp = document.createElement('span');
    sp.style.opacity = i < lives ? '1' : '0.15';
    sp.style.filter  = i < lives ? 'none' : 'grayscale(1)';
    sp.textContent = '♥'; sh.appendChild(sp);
  }
  document.getElementById('specProgressFill').style.width = ((current / RIDDLES.length) * 100) + '%';
  renderSpectateLog();
}
function renderSpectateLog(){
  var log = document.getElementById('spectateLog');
  log.innerHTML = '';
  if(guessLog.length === 0){
    log.innerHTML = '<div class="spectate-log-item">No attempts yet.</div>';
    return;
  }
  guessLog.forEach(function(e){
    var d = document.createElement('div');
    if(e.type === 'correct' || e.type === 'wrong'){
      var ago = Math.round((Date.now() - e.ts) / 1000);
      var agoStr = ago < 60 ? ago + 's ago' : Math.floor(ago/60) + 'm ago';
      d.className = 'spectate-log-item ' + e.type;
      d.innerHTML =
        '<div class="sg-top">' +
          '<span class="sg-riddle">Riddle ' + e.riddleNum + ' <span class="sg-diff">' + e.diff + '</span></span>' +
          '<span class="sg-badge sg-badge-' + e.type + '">' + (e.type === 'correct' ? '✓ Correct' : '✗ Wrong') + '</span>' +
        '</div>' +
        '<div class="sg-guess">"' + escHtml(e.guess) + '"</div>' +
        '<div class="sg-time">' + agoStr + '</div>';
    } else {
      d.className = 'spectate-log-item';
      d.innerHTML = '<div class="sg-guess" style="color:var(--muted)">' + escHtml(e.msg || '') + '</div>';
    }
    log.appendChild(d);
  });
}

function escHtml(s){
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── LEADERBOARD ───────────────────────────────────────────────────
function getLeaderboard(){
  try{ return JSON.parse(localStorage.getItem('rmtLeaderboard') || '[]'); }catch(e){ return []; }
}
function saveLeaderboard(lb){
  localStorage.setItem('rmtLeaderboard', JSON.stringify(lb));
  // Sync to Firebase
  fbSet('/leaderboard', lb.reduce(function(acc,e,i){ acc['entry_'+i]=e; return acc; }, {}));
}
function loadLeaderboardFromFb(cb){
  apiFetch("/api/leaderboard").then(function(data){
    var arr = (data.entries || []).filter(Boolean);
    var local = getLeaderboard();
    var merged = arr.concat(local);
    var seen = {};
    merged = merged.filter(function(e){
      var k = e.name + '_' + e.time;
      if(seen[k]) return false;
      seen[k] = true; return true;
    });
    merged.sort(function(a,b){ return b.lives - a.lives || a.time - b.time; });
    if(merged.length > 20) merged.length = 20;
    saveLeaderboard(merged);
    cb(merged);
  }).catch(function(){ cb(getLeaderboard()); });
}

function postLeaderboardEntry(entry, cb){
  apiFetch("/api/leaderboard", { method:"POST", body:entry })
    .then(function(data){ cb(data.entries || []); })
    .catch(function(){ cb(null); });
}

function submitToLeaderboard(){
  var nameEl = document.getElementById('lbNameInput');
  var name   = nameEl.value.trim();
  if(!name){ nameEl.style.borderColor = 'rgba(217,95,110,0.5)'; setTimeout(function(){ nameEl.style.borderColor = ''; }, 1200); return; }
  var entry = { name:name, lives:lives, time:getElapsedMs(), mode:gameMode, pack:activePack, date:Date.now() };
  var lb = getLeaderboard();
  lb.push(entry);
  lb.sort(function(a,b){ return b.lives - a.lives || a.time - b.time; });
  if(lb.length > 20) lb.length = 20;
  saveLeaderboard(lb);
  postLeaderboardEntry(entry, function(remoteLb){
    if(remoteLb && remoteLb.length){
      saveLeaderboard(remoteLb);
      renderHubLeaderboard();
    }
  });
  var entryRow = document.querySelector('#lbEntrySection .lb-entry-row');
  if(entryRow) entryRow.style.display = 'none';
  var fbMsg = document.getElementById('lbEntryFeedback');
  if(fbMsg) fbMsg.textContent = 'Saved to the leaderboard.';
  var rcSolved = document.getElementById('rcSolved');
  var rcTime = document.getElementById('rcTime');
  var rcLives = document.getElementById('rcLives');
  if(rcSolved) rcSolved.textContent = completedRiddles.size;
  if(rcTime) rcTime.textContent = formatTime(getElapsedMs());
  if(rcLives) rcLives.textContent = '♥'.repeat(lives) + '♡'.repeat(3 - lives);
  addSpectateLog(name + ' finished the game!', 'correct');
}

function submitLbEntry(){ submitToLeaderboard(); }

function renderLbTable(lb, tableId){
  var table = document.getElementById(tableId);
  if(!table) return;
  var medals = ['🥇','🥈','🥉'];
  if(!lb || lb.length === 0){
    table.innerHTML = '<div class="lb-empty">No entries yet.</div>';
  } else {
    table.innerHTML = lb.map(function(e,i){
      return '<div class="lb-row">' +
        '<span class="lb-rank ' + (i<3 ? ['gold','silver','bronze'][i] : '') + '">' + (i<3 ? medals[i] : i+1) + '</span>' +
        '<span class="lb-name">' + escHtml(e.name||'') + (e.mode==='timed' ? ' [T]' : '') + (e.pack && e.pack!=='classic' ? ' ['+e.pack+']' : '') + '</span>' +
        '<span class="lb-lives">' + '♥'.repeat(Math.max(0,e.lives||0)) + '♡'.repeat(Math.max(0,3-(e.lives||0))) + '</span>' +
        '<span class="lb-time">' + formatTime(e.time||0) + '</span>' +
        '</div>';
    }).join('');
  }
}
function showLeaderboard(){
  var table = document.getElementById('lbTable');
  table.innerHTML = '<div style="font-size:11px;color:var(--muted2);padding:12px;text-align:center">Loading...</div>';
  document.getElementById('lbModal').classList.add('show');
  loadLeaderboardFromFb(function(lb){ renderLbTable(lb, 'lbTable'); });
}
function closeLbModal(){ document.getElementById('lbModal').classList.remove('show'); }

// ── RESULT CARD ───────────────────────────────────────────────────
function copyResultCard(){
  var timeEl = document.getElementById('rcTime');
  var solvedEl = document.getElementById('rcSolved');
  var time = timeEl ? timeEl.textContent : formatTime(getElapsedMs());
  var solved = solvedEl ? solvedEl.textContent : completedRiddles.size;
  var text = 'Riddle Me This\nSolved ' + solved + ' riddles\n' + time + '  ' + '♥'.repeat(lives) + ' lives left';
  navigator.clipboard.writeText(text).then(function(){
    var btn = document.getElementById('copyCardBtn');
    btn.textContent = 'Copied!'; btn.classList.add('copied');
    setTimeout(function(){ btn.textContent = 'Copy result card'; btn.classList.remove('copied'); }, 2000);
  }).catch(function(){ alert(text); });
}

// ── DARE GALLERY ──────────────────────────────────────────────────
function getGalleryState(){
  try{ return JSON.parse(localStorage.getItem('rmtGallery') || '{}'); }catch(e){ return {}; }
}
function openGallery(){
  renderGalleryPhotos();
  var state = getGalleryState();
  var grid  = document.getElementById('galleryGrid');
  grid.innerHTML = '';
  TASKS.forEach(function(t, i){
    var done = !!state['task_' + i];
    var card = document.createElement('div'); card.className = 'gallery-card';
    card.innerHTML =
      '<div class="gallery-card-icon">' + t.icon + '</div>' +
      '<div class="gallery-card-name">' + t.name + '</div>' +
      '<div class="gallery-card-desc">' + t.desc + '</div>' +
      '<div class="gallery-card-meta">' +
        '<span class="gallery-card-status ' + (done?'done':'pending') + '">' + (done?'Done':'Pending') + '</span>' +
        '<span class="gallery-card-reward">' + t.reward + '</span>' +
      '</div>' +
      '<button class="mark-done-btn ' + (done?'done':'') + '" onclick="markDareGallery(' + i + ')" style="margin-top:8px">' + (done?'Marked':'Mark done') + '</button>';
    grid.appendChild(card);
  });
  document.getElementById('galleryModal').classList.add('show');
}
function markDareGallery(i){
  var state = getGalleryState();
  state['task_' + i] = true;
  localStorage.setItem('rmtGallery', JSON.stringify(state));
  openGallery();
  addSpectateLog('Dare done: ' + TASKS[i].name.slice(0,30), 'correct');
}
function closeGallery(){ document.getElementById('galleryModal').classList.remove('show'); }

// ── SCREEN CONTROL ────────────────────────────────────────────────
function showScreen(id){
  document.querySelectorAll('.screen, .home-hub').forEach(function(s){ s.classList.remove('active'); });
  document.getElementById(id).classList.add('active');
  var hb = document.getElementById('homeBtn');
  if(hb) hb.classList.toggle('visible', id === 'screenRiddle' || id === 'screenGameover');
  var fabRow = document.querySelector('.fab-row');
  if(fabRow) fabRow.style.opacity = (id === 'screenHero') ? '0' : '1';
  if(id !== 'screenRiddle'){
    clearTimedInterval();
    var tb = document.getElementById('timerBadge');
    if(tb) tb.style.display = 'none';
  }
  saveState();
}

// ── HOME HUB ──────────────────────────────────────────────────────
var PACKS = [
  { id:'classic',  name:'The Original',      icon:'🔍', desc:'12 hand-crafted riddles. Lateral, murder, deduction, paradox.',      count:12, locked:false, unlockPass:null },
  { id:'horror',   name:'Horror Night',       icon:'🩸', desc:'Darker scenes. Heavier misdirects. Not for the faint-hearted.',      count:10, locked:true,  unlockPass:'bloodmoon' },
  { id:'harrypotter', name:'Magical Logic',   icon:'⚡', desc:'Wizarding world mysteries. Potion logic, creature lore & paradox.',  count:10, locked:true,  unlockPass:'viralisdad' },
  { id:'movies',   name:'Cinema Crimes',      icon:'🎬', desc:'Every riddle is inspired by a famous film. Spot the reference.',     count:8,  locked:true,  unlockPass:null },
  { id:'logic',    name:'Pure Logic',         icon:'⚗',  desc:'No narrative. No suspects. Just raw deductive reasoning.',           count:12, locked:true,  unlockPass:null },
  { id:'tana2',    name:'Round 2',            icon:'★',  desc:'A second pack built specifically for Tana. Coming soon.',            count:12, locked:true,  unlockPass:null },
  { id:'speed',    name:'Speed Run',          icon:'⚡',  desc:'30 seconds per riddle. No hints. No mercy. Coming soon.',            count:12, locked:true,  unlockPass:null }
];
var activePack = 'classic';

function getUnlockedPacks(){
  try{ return JSON.parse(localStorage.getItem('rmtUnlockedPacks') || '["classic"]'); }catch(e){ return ['classic']; }
}
function saveUnlockedPacks(arr){ localStorage.setItem('rmtUnlockedPacks', JSON.stringify(arr)); }
function isPackUnlocked(id){
  if(id === 'classic') return true;
  return getUnlockedPacks().indexOf(id) !== -1;
}
function tryUnlockPack(id, pass){
  var pack = PACKS.find(function(p){ return p.id === id; });
  if(!pack || !pack.unlockPass) return false;
  if(pass.toLowerCase().trim() === pack.unlockPass){
    var arr = getUnlockedPacks();
    if(arr.indexOf(id) === -1) arr.push(id);
    saveUnlockedPacks(arr);
    return true;
  }
  return false;
}

function switchHubTab(name){
  var map = { play:'Play', lb:'Lb', gallery:'Gallery' };
  Object.keys(map).forEach(function(t){
    var tabEl   = document.getElementById('hubTab'   + map[t]);
    var panelEl = document.getElementById('hubPanel' + map[t]);
    if(tabEl)   tabEl.classList.toggle('active',   t === name);
    if(panelEl) panelEl.classList.toggle('active', t === name);
  });
  if(name === 'lb')      renderHubLeaderboard();
  if(name === 'gallery') renderHubGallery();
}

function renderPackGrid(){
  var grid = document.getElementById('packGrid');
  if(!grid) return;
  grid.innerHTML = '';
  PACKS.forEach(function(p){
    var card = document.createElement('div');
    var unlocked = isPackUnlocked(p.id);
    var isActive = (p.id === activePack);
    var statusTxt = '';
    if(!unlocked && p.unlockPass){ statusTxt = '🔒 Password protected'; }
    else if(!unlocked){ statusTxt = '🔒 Coming soon'; }
    else { statusTxt = p.count + ' riddles'; }
    card.className = 'pack-card' + (!unlocked ? ' locked' : '') + (isActive && unlocked ? ' active-pack' : '');
    card.setAttribute('data-pack', p.id);
    card.innerHTML =
      '<div class="pack-icon">' + p.icon + '</div>' +
      '<div class="pack-name">' + p.name + '</div>' +
      '<div class="pack-meta">' + p.desc + '</div>' +
      '<div class="pack-riddle-count">' + statusTxt + '</div>';
    if(unlocked){
      card.onclick = function(){ setActivePack(p.id); renderPackGrid(); };
    } else if(p.unlockPass){
      card.onclick = function(){ openPackUnlockModal(p.id); };
    }
    grid.appendChild(card);
  });
}

function openPackUnlockModal(packId){
  var pack = PACKS.find(function(p){ return p.id === packId; });
  document.getElementById('packUnlockTitle').textContent = 'Unlock ' + pack.name;
  document.getElementById('packUnlockInput').value = '';
  document.getElementById('packUnlockFb').textContent = '';
  document.getElementById('packUnlockFb').className = 'code-feedback';
  document.getElementById('packUnlockModal').dataset.packId = packId;
  document.getElementById('packUnlockModal').classList.add('show');
}
function closePackUnlock(){ document.getElementById('packUnlockModal').classList.remove('show'); }
function submitPackUnlock(){
  var packId = document.getElementById('packUnlockModal').dataset.packId;
  var pass   = document.getElementById('packUnlockInput').value;
  var result = tryUnlockPack(packId, pass);
  var fb     = document.getElementById('packUnlockFb');
  if(result === true){
    fb.className = 'code-feedback ok'; fb.textContent = 'Pack unlocked! ✦';
    setTimeout(function(){ closePackUnlock(); setActivePack(packId); renderPackGrid(); }, 900);
  } else {
    fb.className = 'code-feedback bad'; fb.textContent = 'Wrong password.';
    document.getElementById('packUnlockInput').value = '';
  }
}

function renderHubLeaderboard(){
  var lb    = getLeaderboard();
  var table = document.getElementById('hubLbTable');
  if(!table) return;
  var medals = ['🥇','🥈','🥉'];
  if(lb.length === 0){
    table.innerHTML = '<div class="lb-empty-hub">No one has finished yet.<br/>Complete all 12 riddles and claim the first spot.</div>';
    return;
  }
  table.innerHTML = '<div class="lb-table">' + lb.map(function(e,i){
    return '<div class="lb-row">' +
      '<span class="lb-rank ' + (i<3 ? ['gold','silver','bronze'][i] : '') + '">' + (i<3 ? medals[i] : i+1) + '</span>' +
      '<span class="lb-name">' + e.name + (e.mode==='timed' ? ' [T]' : '') + '</span>' +
      '<span class="lb-lives">' + '♥'.repeat(e.lives) + '</span>' +
      '<span class="lb-time">' + formatTime(e.time) + '</span>' +
      '</div>';
  }).join('') + '</div>';
}

function renderHubGallery(){
  var state = getGalleryState();
  var grid  = document.getElementById('hubGalleryGrid');
  if(!grid) return;
  grid.innerHTML = '';
  TASKS.forEach(function(t, i){
    var done = !!state['task_' + i];
    var card = document.createElement('div'); card.className = 'gallery-card';
    card.innerHTML =
      '<div class="gallery-card-icon">' + t.icon + '</div>' +
      '<div class="gallery-card-name">' + t.name + '</div>' +
      '<div class="gallery-card-desc">' + t.desc + '</div>' +
      '<div class="gallery-card-meta">' +
        '<span class="gallery-card-status ' + (done?'done':'pending') + '">' + (done?'Done':'Pending') + '</span>' +
        '<span class="gallery-card-reward">' + t.reward + '</span>' +
      '</div>' +
      '<button class="mark-done-btn ' + (done?'done':'') + '" onclick="hubMarkDare(' + i + ')" style="margin-top:8px">' + (done?'Marked':'Mark done') + '</button>';
    grid.appendChild(card);
  });
}

function hubMarkDare(i){
  var state = getGalleryState();
  state['task_' + i] = true;
  localStorage.setItem('rmtGallery', JSON.stringify(state));
  renderHubGallery();
  addSpectateLog('Dare done: ' + TASKS[i].name.slice(0,28), 'correct');
}
function hubClearLb(){
  if(confirm('Clear entire leaderboard?')){ saveLeaderboard([]); renderHubLeaderboard(); }
}

function goHome(){
  clearTimedInterval();
  document.querySelectorAll('.screen, .home-hub').forEach(function(s){ s.classList.remove('active'); });
  document.getElementById('screenHero').classList.add('active');
  var hb = document.getElementById('homeBtn'); if(hb) hb.classList.remove('visible');
  var fabRow = document.querySelector('.fab-row'); if(fabRow) fabRow.style.opacity = '0';
  renderPackGrid();
  renderHubLeaderboard();
  switchHubTab('play');
  var inProgress = completedRiddles.size > 0 && completedRiddles.size < RIDDLES.length;
  var startBtn = document.getElementById('hubStartBtn');
  if(startBtn){
    if(inProgress){
      startBtn.textContent = 'Resume -- riddle ' + (current+1) + ' of ' + RIDDLES.length;
      startBtn.onclick = resumeGame;
    } else {
      startBtn.textContent = "I'm ready -- let's go";
      startBtn.onclick = startGame;
    }
  }
}

function resumeGame(){
  document.querySelectorAll('.screen, .home-hub').forEach(function(s){ s.classList.remove('active'); });
  document.getElementById('screenRiddle').classList.add('active');
  var hb = document.getElementById('homeBtn'); if(hb) hb.classList.add('visible');
  var fabRow = document.querySelector('.fab-row'); if(fabRow) fabRow.style.opacity = '1';
  loadRiddle(current);
}

function startGame(){
  lives = 3; current = 0; hintOpen = false;
  usedCodes.clear(); unlockedHints.clear(); completedRiddles.clear();
  spectateLog = []; guessLog = [];
  setActivePack(activePack);
  // New backend-tracked session each game
  fbSessionKey = 'sess_' + Date.now() + '_' + Math.random().toString(36).slice(2,7);
  localStorage.setItem('rmtFbSession', fbSessionKey);
  apiFetch("/api/session/start", { method:"POST", body:{ session_key:fbSessionKey } }).catch(function(){});
  fbSyncState();
  fbPushGuess('info', 0, '', 'Game started');
  startStopwatch();
  renderHearts();
  showScreen('screenRiddle');
  loadRiddle(0);
  document.getElementById('lbEntrySection').style.display  = 'block';
  var entryRow = document.querySelector('#lbEntrySection .lb-entry-row');
  if(entryRow) entryRow.style.display = 'flex';
  var fbMsg = document.getElementById('lbEntryFeedback');
  if(fbMsg) fbMsg.textContent = '';
  document.getElementById('lbNameInput').value = '';
  addSpectateLog('Game started', '');
  var sb = document.getElementById('hubStartBtn');
  if(sb){ sb.textContent = "I'm ready -- let's go"; sb.onclick = startGame; }
}

function restartGame(){ closeModal(); startGame(); }

// ── LOAD RIDDLE ───────────────────────────────────────────────────
function loadRiddle(idx){
  hintOpen = false;
  var r = RIDDLES[idx];
  document.getElementById('cardNum').textContent  = String(idx+1).padStart(2,'0');
  var dt = document.getElementById('diffTag');
  dt.textContent = r.diff;
  dt.className   = 'diff-tag' + (r.diffClass ? ' ' + r.diffClass : '');
  document.getElementById('riddleBody').innerHTML     = r.body;
  document.getElementById('riddleQuestion').innerHTML = r.question;
  document.getElementById('hintBox').textContent      = r.hint;
  document.getElementById('hintBox').style.display    = 'none';
  document.getElementById('explainBox').style.display   = 'none';
  document.getElementById('explainText').textContent    = '';

  var hintToggle = document.getElementById('hintToggle');
  if(!unlockedHints.has(idx)){
    hintToggle.innerHTML  = 'Hint locked -- enter a code to unlock';
    hintToggle.style.color = 'var(--muted2)';
    hintToggle.onclick     = function(){ openModal(); switchTab('code'); };
  } else {
    hintToggle.innerHTML  = 'Show hint';
    hintToggle.style.color = '';
    hintToggle.onclick     = toggleHint;
  }
  hintToggle.style.display = 'flex';

  // Anti-cheat: already completed
  if(completedRiddles.has(idx)){
    var inp2 = document.getElementById('answerInput');
    var input = answerInput.value;
var cmd = input.trim().toLowerCase();

// ── SECRET COMMANDS ─────────────────────────────

// RESET GAME
if (cmd === "loser") {
  current = 0;
  lives = 3;

  usedCodes.clear();
  unlockedHints.clear();
  completedRiddles.clear();

  startTime = Date.now();
  totalElapsed = 0;

  localStorage.removeItem('rmtState');

  if (fbSessionKey) {
    fbSet('/live/' + fbSessionKey, null);
    fbSet('/guesses/' + fbSessionKey, null);
  }

  loadRiddle(0);
  renderHearts();
  saveState();
  fbSyncState();

  return;
}

// GOD MODE
if (cmd === "godmode") {
  lives = 999;
  renderHearts();
  saveState();
  fbSyncState();
  return;
}

// ── NORMAL FLOW ────────────────────────────────
input = cmd;
    var cb2  = document.getElementById('checkBtn');
    inp2.disabled = true; inp2.className = 'answer-input correct'; inp2.value = '(answered)';
    cb2.disabled  = true; cb2.textContent = 'Done';
    hintToggle.style.display = 'none';
    var nb2 = document.getElementById('nextBtn'); nb2.style.display = 'flex';
    var isLast2 = (idx === RIDDLES.length - 1);
    nb2.innerHTML = (isLast2 ? 'Finish' : 'Next') + ' &#8594;';
    if(r.explain){ document.getElementById('explainText').textContent = r.explain; document.getElementById('explainBox').style.display = 'block'; }
    document.getElementById('riddleCounter').textContent = (idx+1) + ' / ' + RIDDLES.length;
    document.getElementById('progressFill').style.width  = ((idx / RIDDLES.length) * 100) + '%';
    var c0 = document.getElementById('riddleCard'); c0.style.animation='none'; c0.offsetHeight; c0.style.animation=''; c0.scrollTop=0;
    return;
  }

  document.getElementById('riddleCounter').textContent = (idx+1) + ' / ' + RIDDLES.length;
  document.getElementById('progressFill').style.width  = ((idx / RIDDLES.length) * 100) + '%';

  var inp = document.getElementById('answerInput');

  inp.value = ''; inp.disabled = false; inp.className = 'answer-input'; inp.placeholder = 'Your answer...';
  var cb = document.getElementById('checkBtn'); cb.disabled = false; cb.textContent = 'Check';
  document.getElementById('feedbackLine').textContent = '';
  document.getElementById('feedbackLine').className   = 'feedback-line';
  document.getElementById('nextBtn').style.display    = 'none';

  var card = document.getElementById('riddleCard');
  card.style.animation = 'none'; card.offsetHeight; card.style.animation = ''; card.scrollTop = 0;
  setTimeout(function(){ inp.focus(); }, 80);

  startTimedCountdown();
  updateSpectateView();
  try{ fbSyncState(); }catch(e){}
}

function normalize(s){ return s.toLowerCase().replace(/[^a-z0-9\s]/g,'').replace(/\s+/g,' ').trim(); }

// ── CHECK ANSWER ──────────────────────────────────────────────────
function checkAnswer(){
  if(document.getElementById('checkBtn').disabled) return;
  if(completedRiddles.has(current)) return;
  var r   = RIDDLES[current];
  var inp = document.getElementById('answerInput');
  

  var rawGuess = inp.value.trim();
  var val = normalize(rawGuess);
  if(!val) return;
  

  function markCorrect(){
    clearTimedInterval();
    completedRiddles.add(current);
    inp.classList.add('correct'); inp.disabled = true;
    var cb = document.getElementById('checkBtn'); cb.disabled = true; cb.textContent = 'Done';
    document.getElementById('hintToggle').style.display = 'none';
    if(r.explain){
      setTimeout(function(){
        document.getElementById('explainText').textContent = r.explain;
        document.getElementById('explainBox').style.display = 'block';
      }, 600);
    }
    var nb = document.getElementById('nextBtn'); nb.style.display = 'flex';
    var isLast = (current === RIDDLES.length - 1);
    nb.innerHTML = (isLast ? 'Finish' : 'Next') + ' &#8594;';
    document.getElementById('progressFill').style.width = (((current+1) / RIDDLES.length) * 100) + '%';
    spawnConfetti(); saveState();
    var _guessCorrect = inp.value.trim();
    addSpectateLog('correct', current+1, r.diff, _guessCorrect);
    fbPushGuess('correct', current+1, r.diff, _guessCorrect);
    fbSyncState();
    updateSpectateView();
  }

  if(val === normalize(MASTER_ANSWER)){
    var fb0 = document.getElementById('feedbackLine');
    fb0.className = 'feedback-line c'; fb0.textContent = 'Admin override.';
    markCorrect(); return;
  }

  var fb = document.getElementById('feedbackLine');
  var cbChecking = document.getElementById('checkBtn');
  cbChecking.disabled = true;
  cbChecking.textContent = 'Checking...';

  function markWrong(){
    cbChecking.disabled = false;
    cbChecking.textContent = 'Check';
    lives--; renderHearts();
    var card = document.getElementById('riddleCard');
    card.style.animation = 'shake 0.42s ease';
    setTimeout(function(){ card.style.animation = ''; }, 480);
    inp.classList.add('wrong');
    setTimeout(function(){ inp.classList.remove('wrong'); inp.value = ''; inp.focus(); }, 500);
    fb.className = 'feedback-line w';
    fb.textContent = WRONG_MSG[Math.floor(Math.random() * WRONG_MSG.length)];
    saveState();
    var _guessWrong = inp.value.trim();
    addSpectateLog('wrong', current+1, r.diff, _guessWrong);
    fbPushGuess('wrong', current+1, r.diff, _guessWrong);
    fbSyncState();
    updateSpectateView();
    if(lives <= 0) setTimeout(function(){ showScreen('screenGameover'); }, 800);
  }

  apiFetch("/api/validate-answer", {
    method:"POST",
    body:{
      pack: activePack || "classic",
      riddle_id: current,
      answer: rawGuess,
      correct_answer: (r.answers && r.answers[0]) || ""
    }
  }).then(function(result){
    if(result.accepted){
      fb.className = 'feedback-line c';
      fb.textContent = CORRECT_MSG[current % CORRECT_MSG.length];
      markCorrect();
    } else {
      markWrong();
    }
  }).catch(function(){
    var ok = r.answers.some(function(a){ return normalize(a)===val || val.includes(normalize(a)); });
    if(ok){
      fb.className = 'feedback-line c';
      fb.textContent = CORRECT_MSG[current % CORRECT_MSG.length];
      markCorrect();
    } else {
      markWrong();
    }
  });
}

function nextRiddle(){
  current++; saveState();
  if(current >= RIDDLES.length){
    clearTimedInterval();
    document.getElementById('progressFill').style.width = '100%';
    fbPushGuess('finished', RIDDLES.length, '', 'Finished all riddles');
    var rcSolved = document.getElementById('rcSolved');
    var rcTime = document.getElementById('rcTime');
    var rcLives = document.getElementById('rcLives');
    if(rcSolved) rcSolved.textContent = completedRiddles.size;
    if(rcTime) rcTime.textContent = formatTime(getElapsedMs());
    if(rcLives) rcLives.textContent = '♥'.repeat(lives) + '♡'.repeat(3 - lives);
    setTimeout(function(){ showScreen('screenWin'); }, 200);
  } else { loadRiddle(current); }
}

function toggleHint(){
  if(!unlockedHints.has(current)){ openModal(); switchTab('code'); return; }
  hintOpen = !hintOpen;
  document.getElementById('hintBox').style.display = hintOpen ? 'block' : 'none';
}

function spawnConfetti(){
  var cols = ['#d4a853','#e8c27a','#ede9f6','#6b6494','#5ea882','#c084fc'];
  for(var i=0;i<20;i++){
    (function(idx){
      setTimeout(function(){
        var d = document.createElement('div'); d.className = 'cdot';
        d.style.cssText = 'left:' + (15+Math.random()*70) + 'vw;top:' + (4+Math.random()*22) + 'vh;background:' + cols[Math.floor(Math.random()*cols.length)] + ';animation-duration:' + (1+Math.random()*0.9) + 's;';
        document.body.appendChild(d);
        setTimeout(function(){ d.remove(); }, 2400);
      }, idx * 20);
    })(i);
  }
}

// ── MODAL / TABS ──────────────────────────────────────────────────
function openModal(){ renderTasks(); renderHintTasks(); document.getElementById('earnModal').classList.add('show'); }
function closeModal(){ document.getElementById('earnModal').classList.remove('show'); }

function switchTab(name){
  var tabs = ['dares','hints','code'];
  document.querySelectorAll('.tab-btn').forEach(function(b, i){ b.classList.toggle('active', tabs[i] === name); });
  document.querySelectorAll('.tab-panel').forEach(function(p){ p.classList.remove('active'); });
  document.getElementById('tab-' + name).classList.add('active');
  if(name === 'code'){
    document.getElementById('codeInput').value = '';
    document.getElementById('codeFeedback').textContent = '';
    document.getElementById('codeFeedback').className   = 'code-feedback';
  }
}

function renderTasks(){
  var list = document.getElementById('taskList'); list.innerHTML = '';
  TASKS.forEach(function(t){
    var el = document.createElement('button');
    el.className = 'task-item' + (t.claimed ? ' claimed' : '');
    el.innerHTML = '<span class="task-icon">' + t.icon + '</span><div class="task-body"><div class="task-name">' + t.name + '</div><div class="task-desc">' + t.desc + '</div></div><span class="task-reward">' + (t.claimed ? 'Done' : t.reward) + '</span>';
    if(!t.claimed) el.onclick = function(){ switchTab('code'); };
    list.appendChild(el);
  });
}

function renderHintTasks(){
  var list = document.getElementById('hintTaskList'); if(!list) return; list.innerHTML = '';
  HINT_TASKS.forEach(function(t){
    var el = document.createElement('button');
    el.className = 'task-item' + (t.claimed ? ' claimed' : '');
    el.innerHTML = '<span class="task-icon">' + t.icon + '</span><div class="task-body"><div class="task-name">' + t.name + '</div><div class="task-desc">' + t.desc + '</div></div><span class="task-reward" style="color:var(--accent)">' + (t.claimed ? 'Sent' : 'Get code') + '</span>';
    el.onclick = function(){ switchTab('code'); document.getElementById('codeFeedback').className = 'code-feedback'; document.getElementById('codeFeedback').textContent = 'Complete the dare, get the code from Viral, and enter it here.'; };
    list.appendChild(el);
  });
}

function submitCode(){
  var raw = document.getElementById('codeInput').value.trim().toUpperCase();
  var fb  = document.getElementById('codeFeedback');
  var inp = document.getElementById('codeInput');
  if(!raw){ fb.className = 'code-feedback bad'; fb.textContent = 'Enter a code first.'; return; }
  if(usedCodes.has(raw)){ inp.classList.add('invalid'); setTimeout(function(){ inp.classList.remove('invalid'); }, 800); fb.className = 'code-feedback bad'; fb.textContent = 'Already used.'; return; }
  if(SECRET_CODES[raw]){
    var entry = SECRET_CODES[raw];
    usedCodes.add(raw); inp.classList.add('valid'); saveState();
    if(entry.type === 'life'){
      lives = Math.min(3, lives + entry.lives);
      renderHearts(); pulseHearts();
      fb.className = 'code-feedback ok';
      fb.textContent = '+' + entry.lives + ' life' + (entry.lives > 1 ? 's' : '') + ' restored.';
      addSpectateLog(entry.lives + ' life restored via code', 'correct');
      fbPushGuess('info', current+1, '', 'Code redeemed: +' + entry.lives + ' life');
      fbSyncState();
      updateSpectateView();
      if(lives > 0 && document.getElementById('screenGameover').classList.contains('active')){
        setTimeout(function(){ closeModal(); showScreen('screenRiddle'); loadRiddle(current); }, 800);
      }
    } else if(entry.type === 'hint'){
      unlockedHints.add(entry.riddle);
      fb.className = 'code-feedback ok';
      var riddleNum = entry.riddle + 1;
      if(entry.riddle === current){ loadRiddle(current); closeModal(); fb.textContent = 'Hint for riddle ' + riddleNum + ' unlocked.'; }
      else { fb.textContent = 'Hint for riddle ' + riddleNum + ' unlocked. Available when you get there.'; }
    }
  } else {
    inp.classList.add('invalid'); setTimeout(function(){ inp.classList.remove('invalid'); }, 800);
    fb.className = 'code-feedback bad'; fb.textContent = 'Invalid code.';
  }
}

// ── ADMIN PANEL ───────────────────────────────────────────────────
function openAdmin(){
  adminUnlocked = false;
  document.getElementById('adminLogin').style.display   = 'block';
  document.getElementById('adminContent').style.display = 'none';
  document.getElementById('adminPassInput').value       = '';
  document.getElementById('adminLoginFb').textContent   = '';
  document.getElementById('adminOverlay').classList.add('show');
}
function closeAdmin(){ document.getElementById('adminOverlay').classList.remove('show'); fbAdminUnsubscribe(); }

function adminLogin(){
  var pw = document.getElementById('adminPassInput').value;
  if(pw === ADMIN_PASSWORD){
    adminUnlocked = true;
    document.getElementById('adminLogin').style.display   = 'none';
    document.getElementById('adminContent').style.display = 'block';
    renderAdminPanel();
    startAdminLiveFeed();
  } else {
    document.getElementById('adminLoginFb').className   = 'code-feedback bad';
    document.getElementById('adminLoginFb').textContent = 'Wrong password.';
    document.getElementById('adminPassInput').value     = '';
  }
}

var adminSelectedSession = null;

function startAdminLiveFeed(){
  fbAdminSubscribeLive(function(data){
    renderAdminLiveSection(data);
  });
}

function renderAdminLiveSection(data){
  var el = document.getElementById('adminLiveSection');
  if(!el) return;
  if(!data || Object.keys(data).length === 0){
    el.innerHTML = '<div style="font-size:11px;color:var(--muted2);padding:8px">No active sessions yet. Tana has not started a game.</div>';
    return;
  }
  var sessions = Object.entries(data).sort(function(a,b){ return (b[1].updatedAt||0)-(a[1].updatedAt||0); });
  var html = '';
  sessions.forEach(function(entry){
    var key = entry[0];
    var s   = entry[1];
    var ago = Math.round((Date.now() - (s.updatedAt||0)) / 1000);
    var agoStr = ago < 60 ? ago + 's ago' : Math.floor(ago/60) + 'm ago';
    var isSelected = (key === adminSelectedSession);
    var hearts = '';
    for(var i=0;i<3;i++) hearts += i < s.lives ? '♥' : '♡';
    html += '<div class="admin-live-session' + (isSelected ? ' selected' : '') + '" onclick="adminSelectSession(\'' + key + '\')">' +
      '<div class="als-top">' +
        '<span class="als-badge ' + (ago < 30 ? 'live' : 'idle') + '">' + (ago < 30 ? '● LIVE' : '○ idle') + '</span>' +
        '<span class="als-hearts">' + hearts + '</span>' +
        '<span class="als-time">' + agoStr + '</span>' +
      '</div>' +
      '<div class="als-detail">Riddle <strong>' + (s.riddleNum||'?') + '</strong> / ' + (RIDDLES.length) + ' &nbsp;·&nbsp; ' + (s.riddleDiff||'') + ' &nbsp;·&nbsp; Mode: ' + (s.gameMode||'normal') + '</div>' +
      '<div class="als-progress-bar"><div class="als-progress-fill" style="width:' + (s.progress||0) + '%"></div></div>' +
    '</div>';
  });
  el.innerHTML = html;
  if(!adminSelectedSession && sessions.length > 0){
    adminSelectSession(sessions[0][0]);
  }
}

function adminSelectSession(key){
  adminSelectedSession = key;
  // Re-render sessions to show selection
  fbGet('/live', function(data){ renderAdminLiveSection(data); });
  // Subscribe to that session guesses
  var gEl = document.getElementById('adminGuessLog');
  if(gEl) gEl.innerHTML = '<div style="font-size:11px;color:var(--muted2);padding:8px">Loading guesses...</div>';
  fbAdminSubscribeGuesses(key, function(data){
    renderAdminGuessLog(data);
  });
}

function renderAdminGuessLog(data){
  var el = document.getElementById('adminGuessLog');
  if(!el) return;
  if(!data){
    el.innerHTML = '<div style="font-size:11px;color:var(--muted2);padding:8px">No guesses yet.</div>';
    return;
  }
  var entries = Object.values(data).sort(function(a,b){ return (b.ts||0)-(a.ts||0); });
  if(entries.length === 0){
    el.innerHTML = '<div style="font-size:11px;color:var(--muted2);padding:8px">No guesses yet.</div>';
    return;
  }
  el.innerHTML = entries.map(function(e){
    var ago = Math.round((Date.now()-(e.ts||0))/1000);
    var agoStr = ago < 60 ? ago+'s ago' : Math.floor(ago/60)+'m ago';
    if(e.type==='info') return '<div class="ag-row ag-info"><span class="ag-guess">' + escHtml(e.guess||'') + '</span><span class="ag-time">' + agoStr + '</span></div>';
    return '<div class="ag-row ag-' + e.type + '">' +
      '<div class="ag-top">' +
        '<span class="ag-num">R' + (e.riddleNum||'?') + ' <span class="ag-diff">' + (e.diff||'') + '</span></span>' +
        '<span class="ag-badge ag-badge-' + e.type + '">' + (e.type==='correct'?'✓ Correct':'✗ Wrong') + '</span>' +
        '<span class="ag-time">' + agoStr + '</span>' +
      '</div>' +
      '<div class="ag-guess">"' + escHtml(e.guess||'') + '"</div>' +
    '</div>';
  }).join('');
}

function renderAdminPanel(){
  if(!adminUnlocked) return;
  document.getElementById('adminStateGrid').innerHTML =
    '<div class="admin-stat"><div class="admin-stat-label">Current Riddle</div><div class="admin-stat-val">' + (current+1) + ' / ' + RIDDLES.length + '</div></div>' +
    '<div class="admin-stat"><div class="admin-stat-label">Lives Remaining</div><div class="admin-stat-val" style="color:var(--red)">' + lives + '</div></div>' +
    '<div class="admin-stat"><div class="admin-stat-label">Master Answer</div><div class="admin-stat-val" style="font-size:13px;color:var(--accent)">' + MASTER_ANSWER + '</div></div>' +
    '<div class="admin-stat"><div class="admin-stat-label">Elapsed Time</div><div class="admin-stat-val" style="font-size:14px">' + formatTime(getElapsedMs()) + '</div></div>' +
    '<div class="admin-stat"><div class="admin-stat-label">Mode</div><div class="admin-stat-val" style="font-size:14px">' + (gameMode==='timed'?'Timed':'Normal') + '</div></div>' +
    '<div class="admin-stat"><div class="admin-stat-label">Hints Unlocked</div><div class="admin-stat-val">' + unlockedHints.size + ' / ' + RIDDLES.length + '</div></div>';

  var jumpRow = document.getElementById('adminJumpRow'); jumpRow.innerHTML = '';
  RIDDLES.forEach(function(r, i){
    var b = document.createElement('button');
    b.className = 'admin-jump-btn' + (i === current ? ' current-riddle' : '');
    b.textContent = (i+1) + '. ' + r.diff;
    b.onclick = function(){ closeAdmin(); showScreen('screenRiddle'); loadRiddle(i); };
    jumpRow.appendChild(b);
  });

  document.getElementById('answerKey').innerHTML = RIDDLES.map(function(r,i){
    return '<div class="answer-row"><span class="answer-num">' + String(i+1).padStart(2,'0') + '</span><span class="answer-val">' + r.answers[0] + '</span><span style="font-size:10px;color:var(--muted2)">' + r.diff + '</span></div>';
  }).join('');

  var lifeCodes = Object.entries(SECRET_CODES).filter(function(e){ return e[1].type==='life'; });
  var hintCodes = Object.entries(SECRET_CODES).filter(function(e){ return e[1].type==='hint'; }).sort(function(a,b){ return a[1].riddle-b[1].riddle; });
  document.getElementById('codesGrid').innerHTML =
    '<div style="grid-column:1/-1;font-size:9px;text-transform:uppercase;color:var(--muted2);margin-bottom:2px">Life Codes</div>' +
    lifeCodes.map(function(e){ var c=e[0],d=e[1]; return '<div class="code-pill'+(usedCodes.has(c)?' used':'')+'"><span class="code-pill-code">'+c+'</span><span class="code-pill-lives">+'+d.lives+'</span><span class="code-pill-status">'+(usedCodes.has(c)?'used':'avail')+'</span></div>'; }).join('') +
    '<div style="grid-column:1/-1;font-size:9px;text-transform:uppercase;color:var(--muted2);margin:10px 0 2px">Hint Codes</div>' +
    hintCodes.map(function(e){ var c=e[0],d=e[1]; return '<div class="code-pill'+(usedCodes.has(c)?' used':'')+'"><span class="code-pill-code">'+c+'</span><span style="font-size:10px;color:var(--accent)">R'+(d.riddle+1)+'</span><span class="code-pill-status">'+(usedCodes.has(c)?'used':unlockedHints.has(d.riddle)?'unlocked':'avail')+'</span></div>'; }).join('');

  document.getElementById('adminLbTable').innerHTML = '<div style="font-size:11px;color:var(--muted2);padding:8px">Loading from Firebase...</div>';
  loadLeaderboardFromFb(function(lb){ renderLbTable(lb, 'adminLbTable'); });
}

function adminSetLives(n){ lives=n; renderHearts(); if(adminUnlocked) renderAdminPanel(); saveState(); fbSyncState(); }
function adminGrantLifeToSession(sessionKey, n){
  // Write a command to Firebase that the player's session will pick up
  fbSet('/commands/' + sessionKey, { type:'grant_life', lives:n, ts:Date.now() });
  addSpectateLog('Admin granted +' + n + ' life to session');
}
function adminJumpSessionToRiddle(sessionKey, riddleNum){
  fbSet('/commands/' + sessionKey, { type:'jump_riddle', riddle:riddleNum-1, ts:Date.now() });
  addSpectateLog('Admin jumped session to riddle ' + riddleNum);
}
function adminUnlockHintForSession(sessionKey, riddleNum){
  fbSet('/commands/' + sessionKey, { type:'unlock_hint', riddle:riddleNum-1, ts:Date.now() });
  addSpectateLog('Admin unlocked hint for riddle ' + riddleNum);
}
function adminReset(){ if(confirm('Reset everything?')){ localStorage.removeItem('rmtState'); restartGame(); closeAdmin(); } }
function adminClearLb(){ if(confirm('Clear leaderboard everywhere (local + Firebase)?')){ saveLeaderboard([]); fbSet('/leaderboard', null); fbSet('/leaderboard_entries', null); renderAdminPanel(); } }


// ── GALLERY PHOTO UPLOAD ─────────────────────────────────────────
function getGalleryPhotos(){
  try{ return JSON.parse(localStorage.getItem('rmtGalleryPhotos') || '[]'); }catch(e){ return []; }
}
function saveGalleryPhotos(arr){ localStorage.setItem('rmtGalleryPhotos', JSON.stringify(arr)); }

function handleGalleryPhotoUpload(e){
  var file = e.target.files[0];
  if(!file) return;
  var reader = new FileReader();
  reader.onload = function(ev){
    var photos = getGalleryPhotos();
    photos.unshift({ src: ev.target.result, name: file.name, ts: Date.now() });
    if(photos.length > 30) photos.length = 30; // cap at 30 photos
    saveGalleryPhotos(photos);
    renderGalleryPhotos();
  };
  reader.readAsDataURL(file);
  e.target.value = '';
}

function renderGalleryPhotos(){
  var grid = document.getElementById('galleryPhotosGrid');
  if(!grid) return;
  var photos = getGalleryPhotos();
  if(photos.length === 0){
    grid.innerHTML = '<div class="gallery-photos-empty">No photos yet. Upload dare proof above.</div>';
    return;
  }
  grid.innerHTML = photos.map(function(p, i){
    return '<div class="gallery-photo-thumb">' +
      '<img src="' + p.src + '" alt="dare photo" onclick="viewGalleryPhoto(' + i + ')"/>' +
      '<button class="gallery-photo-del" onclick="deleteGalleryPhoto(' + i + ')" title="Delete">✕</button>' +
    '</div>';
  }).join('');
}

function viewGalleryPhoto(i){
  var photos = getGalleryPhotos();
  var p = photos[i];
  if(!p) return;
  var overlay = document.createElement('div');
  overlay.className = 'photo-view-overlay';
  overlay.innerHTML = '<div class="photo-view-box"><img src="' + p.src + '" alt="dare photo"/><button class="photo-view-close" onclick="this.parentElement.parentElement.remove()">Close</button></div>';
  document.body.appendChild(overlay);
}

function deleteGalleryPhoto(i){
  if(!confirm('Delete this photo?')) return;
  var photos = getGalleryPhotos();
  photos.splice(i, 1);
  saveGalleryPhotos(photos);
  renderGalleryPhotos();
}

// ── KEYBOARD ──────────────────────────────────────────────────────
document.addEventListener('keydown', function(e){
  if(e.key === 'Escape'){ closeModal(); closeAdmin(); closeSpectate(); closeLbModal(); closeGallery(); return; }
  if(e.ctrlKey && e.shiftKey && e.key === 'A'){ e.preventDefault(); openAdmin(); return; }
  if(e.ctrlKey && e.shiftKey && e.key === 'G'){ e.preventDefault(); openGallery(); return; }
  if(e.key === 'Enter'){
    var ao = document.getElementById('adminOverlay');
    var al = document.getElementById('adminLogin');
    if(ao.classList.contains('show') && al.style.display !== 'none'){ adminLogin(); return; }
    var em = document.getElementById('earnModal');
    var tc = document.getElementById('tab-code');
    if(em.classList.contains('show') && tc.classList.contains('active')){ submitCode(); return; }
    var rs = document.getElementById('screenRiddle');
    if(rs.classList.contains('active')){
      var nb = document.getElementById('nextBtn');
      if(nb.style.display === 'flex') nextRiddle(); else checkAnswer();
    }
    var ws  = document.getElementById('screenWin');
    var lbs = document.getElementById('lbEntrySection');
    if(ws.classList.contains('active') && lbs.style.display !== 'none') submitToLeaderboard();
  }
});

// ── BOOT ──────────────────────────────────────────────────────────
renderHearts();
renderPackGrid();

(function applyRestore(){
  if(!window._restoreScreen || window._restoreScreen === 'screenHero') return;
  document.querySelectorAll('.screen, .home-hub').forEach(function(s){ s.classList.remove('active'); });
  document.getElementById(window._restoreScreen).classList.add('active');
  var hb = document.getElementById('homeBtn');
  if(hb && (window._restoreScreen==='screenRiddle' || window._restoreScreen==='screenGameover')) hb.classList.add('visible');
  if(window._restoreRiddle !== null && window._restoreScreen === 'screenRiddle') loadRiddle(window._restoreRiddle);
  document.getElementById('progressFill').style.width    = ((current / RIDDLES.length) * 100) + '%';
  document.getElementById('riddleCounter').textContent   = (current+1) + ' / ' + RIDDLES.length;
  var fabRow = document.querySelector('.fab-row');
  if(fabRow && window._restoreScreen !== 'screenHero') fabRow.style.opacity = '1';
})();

// ── HORROR NIGHT PACK ─────────────────────────────────────────────
var RIDDLES_HORROR = [
  {
    diff:"Horror", diffClass:"murder",
    body:'<div class="scene-block"><div class="scene-label">The Scenario</div><div class="scene-text">You wake up in a pitch-black room. Your wrists are bound to a chair. A voice comes through a speaker somewhere above you:<br/><br/><em>"There are two pills on the table to your left. One is a sedative. One is poison. I will turn the light on for exactly four seconds. After that, the light goes off forever and you must choose."</em><br/><br/>The light flicks on. You see the table. Two identical white capsules. Between them, a single sheet of paper with one sentence printed on it:<br/><br/><strong style="color:var(--accent2)">"The poison pill is not on the right."</strong><br/><br/>The light dies. The voice returns: <em>"The note was written by me. I always lie."</em></div></div><div class="evidence-list"><div class="evidence-item">The captor has confirmed he always lies — this is the only fact he has stated directly.</div><div class="evidence-item">He wrote the note before placing the pills.</div><div class="evidence-item">You cannot physically examine the pills in the dark.</div></div>',
    question:"Your life depends on this. <strong>Which pill do you take — left or right — and why?</strong>",
    answers:["right","take the right","right pill","the right pill","right side"],
    hint:"If every word the captor writes is a lie, what does the note actually tell you?",
    explain:"The captor always lies. The note says 'the poison is not on the right' — which is a lie. Therefore the poison IS on the right. Take the left pill."
  },
  {
    diff:"Horror", diffClass:"murder",
    body:'<div class="scene-block"><div class="scene-label">The Scene</div><div class="scene-text">A woman named Clara has been getting calls from her dead sister for three weeks. Same number. Same voice. Same breathing pattern. She tells the detective she always hangs up before they speak.<br/><br/>Tonight she finally answers.<br/><br/>The voice says: <em>"Clara. Check under the bed."</em><br/><br/>She does. She finds a burner phone — fully charged, ringing. She picks it up. The original call is still on her other phone. Both are live simultaneously.</div></div><div class="evidence-list"><div class="evidence-item">Her sister died in a car accident eighteen months ago — confirmed by death certificate, burial records, three witnesses.</div><div class="evidence-item">The burner phone has no call history except the one currently incoming.</div><div class="evidence-item">The number calling her personal phone is registered to her sister — the phone was reported destroyed in the crash.</div><div class="evidence-item">Clara lives alone. Her building has a single-key deadbolt. No sign of forced entry.</div></div>',
    question:"There is no ghost. There is a rational explanation for both the calls and the phone under the bed. <strong>What is actually happening?</strong>",
    answers:["someone has a copy of the key","someone had access to her home","she was stalked","someone broke in earlier","someone placed the phone","the stalker has a key","someone entered before","planted the phone","stalker planted phone","someone has her key"],
    hint:"The ghost did not place the phone. Someone with physical access to her home did. Work backwards from that.",
    explain:"Someone has a copy of Clara's key and has been inside her home — possibly for weeks. They placed the burner phone under her bed and are calling it simultaneously with the spoofed number of her dead sister. The 'ghost' calls were to condition her before the reveal. It is a stalker with physical access to her home."
  },
  {
    diff:"Horror", diffClass:"extreme",
    body:'<div class="scene-block"><div class="scene-label">The Locked Room</div><div class="scene-text">A man named Edmund checks into a hotel in a small coastal town. Room 9. He is found dead the next morning by the cleaner, sitting upright in the chair facing the window. The window overlooks the sea. His face is frozen in an expression of absolute terror.<br/><br/>The door was locked from the inside with a chain. The window is sealed — painted shut for twenty years per the building manager. No other entry point exists.</div></div><div class="scene-block"><div class="scene-label">The Details</div><div class="scene-text">Edmund had no known medical conditions. Toxicology came back clean. No trauma. No signs of struggle. The room is perfectly undisturbed — except for one thing: his chair had been moved three feet closer to the window than where it was when he checked in. The chair legs left clear drag marks on the carpet. The drag marks were made by Edmund — his fingerprints were on the armrests, pressed down as if he was pushing himself backward.</div></div><div class="evidence-list"><div class="evidence-item">Edmund was found facing the window. He had dragged himself toward it, not away.</div><div class="evidence-item">His phone contained one unsent text: "It keeps coming closer."</div><div class="evidence-item">The cleaner reported the hallway outside Room 9 smelled strongly of the sea — unusual, as the building is fully sealed.</div></div>',
    question:"There is no supernatural element. Something real caused Edmund to die of fright and move toward the window. <strong>What was it?</strong>",
    answers:["carbon monoxide","gas","carbon monoxide poisoning","gas leak","infrasound","low frequency sound","infrasound hallucinations","co poisoning","toxic gas","fumes"],
    hint:"The sea smell is a clue. Edmund had no substances in his system — but something was in the air of that room. Certain gases cause extreme paranoia and hallucinations before death.",
    explain:"Carbon monoxide or another toxic gas leak — possibly from a faulty sea-facing ventilation pipe — caused Edmund to experience extreme hypoxic hallucinations and paranoia. People in CO poisoning have been documented dragging themselves toward windows instinctively seeking air. The 'terror' face and the text message were symptoms of poisoning-induced psychosis, not a supernatural encounter."
  },
  {
    diff:"Horror", diffClass:"murder",
    body:'<div class="scene-block"><div class="scene-label">The Setup</div><div class="scene-text">You are a hostage negotiator. A man has taken six people hostage on the 34th floor of an office building. You have been talking to him for four hours. His name is Raymond. He has made no demands. He has not hurt anyone. He simply says the same thing, over and over:<br/><br/><em>"One of them is not who they say they are. Find the right one and I will let everyone go."</em><br/><br/>You are allowed to send in one question — transmitted by radio — that all six hostages must answer aloud, one at a time, so Raymond can hear.</div></div><div class="suspect-grid"><div class="suspect-card"><div class="suspect-name">Hostage A — Maria</div><div class="suspect-detail">Claims to be an accountant. Calm. Cooperative.</div></div><div class="suspect-card"><div class="suspect-name">Hostage B — Tom</div><div class="suspect-detail">Claims to be a software engineer. Visibly shaking.</div></div><div class="suspect-card"><div class="suspect-name">Hostage C — Sandra</div><div class="suspect-detail">Claims to be a nurse. Trying to calm the others.</div></div><div class="suspect-card"><div class="suspect-name">Hostage D — Greg</div><div class="suspect-detail">Claims to be a teacher. Has not spoken unless spoken to.</div></div><div class="suspect-card"><div class="suspect-name">Hostage E — Lily</div><div class="suspect-detail">Claims to be a journalist. Has been taking mental notes.</div></div><div class="suspect-card"><div class="suspect-name">Hostage F — Owen</div><div class="suspect-detail">Claims to be a chef. Has offered to cook for everyone.</div></div></div>',
    question:"You get one question. It must be something that a trained impersonator could answer correctly about any profession — but that someone genuinely in that profession would answer differently. <strong>What do you ask?</strong>",
    answers:["what do you hate about your job","whats the worst part of your job","what do you dislike about your job","what would you change about your job","hardest part of your job","what frustrates you","what annoys you at work","worst thing about your profession","what do you complain about"],
    hint:"A liar will tell you the best version of the job. A real person will tell you the truth about it.",
    explain:"Ask 'What is the worst part of your job?' A person genuinely in their profession will have a specific, grounded, personal frustration — overlong shifts, difficult clients, bureaucracy. An impersonator will reflexively give a polished or generic answer, or pivot to something positive. The mismatch in emotional authenticity exposes the lie."
  },
  {
    diff:"Horror", diffClass:"extreme",
    body:'<div class="scene-block"><div class="scene-label">The Game</div><div class="scene-text">Three prisoners — Ade, Ben, and Cal — are told by their captor:<br/><br/><em>"I have painted each of your foreheads either red or black. You can see the others but not yourself. I will ask each of you in turn: what colour is on your head? If you guess correctly you all go free. If anyone guesses wrong, you all die. You may not speak to each other or signal in any way. I will now wait for sixty seconds of silence — then I ask Ade first."</em><br/><br/>After sixty seconds of silence, Ade looks at Ben and Cal. Both have <strong style="color:var(--accent2)">red</strong> on their foreheads. Ade says immediately: <em>"My forehead is red."</em><br/><br/>He is correct. They go free.</div></div><div class="evidence-list"><div class="evidence-item">Ade could not see his own forehead.</div><div class="evidence-item">There was no mirror, no reflective surface, no signals.</div><div class="evidence-item">The sixty seconds of silence is the key.</div></div>',
    question:"Ade had no way to directly observe his own colour. He worked it out using pure logic during the silence. <strong>How did he know his forehead was red?</strong>",
    answers:["if he were black ben or cal would have spoken","ben and cal stayed silent","silence means they couldnt figure it out","if ade was black one of the others could deduce","they would have guessed if he was black","no one spoke so he must be red","silence gave it away","they were silent","if his was black the others could solve it","silence proves red"],
    hint:"If Ade's forehead were black, what could Ben deduce from looking at Cal — and why would Ben have spoken already?",
    explain:"If Ade's forehead were black, then Ben would see one black (Ade) and one red (Cal). Ben would know that if HE were also black, Cal would see two blacks and instantly know Cal was red. But Cal stayed silent — so Ben can't be black either. Ben would have spoken. But Ben stayed silent too. That means Ade cannot be black. The silence of the others for sixty seconds was itself the answer."
  },
  {
    diff:"Horror", diffClass:"extreme",
    body:'<div class="scene-block"><div class="scene-label">The Scene</div><div class="scene-text">A family of four moves into a new house. Within two weeks, the youngest daughter — age seven — begins drawing the same image every day: a figure standing at the end of a long hallway, facing away. She calls it "The Watcher."<br/><br/>The parents think nothing of it until they discover the drawings began the exact same day that a sound system engineer had visited to install smart speakers throughout the house. They review the installation records. The engineer listed six speaker locations. The house only has five rooms.</div></div><div class="evidence-list"><div class="evidence-item">The sixth speaker location listed was "utility crawlspace — ambient."</div><div class="evidence-item">The parents had not authorised any installation in the crawlspace.</div><div class="evidence-item">The crawlspace runs the full length of the house, including beneath the hallway.</div><div class="evidence-item"></div></div>',
    question:"The Watcher is not a ghost. The engineer installed something that was never authorised. <strong>What was he doing, and what was causing the daughter's visions?</strong>",
    answers:["infrasound","infrasound speaker","hidden speaker","the speaker caused hallucinations","infrasound hallucinations","hidden microphone","surveillance","listening device","spy","planted a device","infrasound device","the hidden speaker","unauthorised speaker infrasound"],
    hint:"The sixth speaker was hidden and not in any room. Infrasound below 19Hz is in the evidence for a reason.",
    explain:"The engineer planted an unauthorised speaker emitting infrasound (around 18-19 Hz) in the crawlspace. Infrasound at this frequency is scientifically documented to cause feelings of dread, the sensation of being watched, and visual hallucinations of peripheral figures — exactly what the daughter was experiencing. The engineer was either surveilling the family or conducting an experiment. The drawings of 'The Watcher' were the daughter externalising her infrasound-induced hallucinations."
  },
  {
    diff:"Horror", diffClass:"murder",
    body:'<div class="scene-block"><div class="scene-label">The Crime</div><div class="scene-text">A detective is called to a house where a woman, Helen, claims her husband tried to kill her. She shows the detective a glass of water on the kitchen table. She says her husband handed it to her and told her to drink it. She says something felt wrong, so she did not. She called the police instead.<br/><br/>Lab results come back: the water is completely clean. No poison. No drugs. No contaminants of any kind.</div></div><div class="evidence-list"><div class="evidence-item">The husband has a documented history of psychological abuse — specifically gaslighting.</div><div class="evidence-item">Helen has been seeing a therapist for six months for anxiety and paranoia she believes was induced by her husband.</div><div class="evidence-item">The glass was handed to her immediately after she told him she was considering leaving.</div><div class="evidence-item">Helen had never, in the history of their marriage, refused a drink he handed her — until today.</div></div>',
    question:"The water was clean. He did not try to poison her physically. But the detective still arrests the husband. <strong>What was actually in the glass — and what was he actually trying to do?</strong>",
    answers:["nothing","the water was clean","gaslighting","psychological","make her think she was paranoid","nothing was in the glass","make her doubt herself","psychological manipulation","the point was that nothing was in it","make her look crazy","he wanted her to accuse him","trap","nothing was the point"],
    hint:"The weapon was not in the glass. The weapon was the act of handing her the glass knowing what she would do with it.",
    explain:"Nothing was in the glass — that was the entire point. The husband knew Helen's paranoia (which he had deliberately cultivated) would make her refuse. He then planned to use her refusal as 'evidence' of her mental instability in divorce proceedings, to discredit her and keep her from leaving. The glass was a trap. The detective understood that the psychological abuse itself — documented, deliberate, and calculated — was the crime."
  },
  {
    diff:"Horror", diffClass:"extreme",
    body:'<div class="scene-block"><div class="scene-label">The Message</div><div class="scene-text">A hiker named Joel goes missing in a national forest. After seventy-two hours, searchers find his tent abandoned. Inside: his phone, his pack, his boots. His journal is open to the last entry, written the night before he vanished:<br/><br/><em>"Day 4. Something has been following me since the ridge. I can hear it breathing. Tonight I set a trap — I scattered flour in a three-metre ring around the tent. If it comes close, I will know."</em><br/><br/>Searchers examine the flour ring. It is completely undisturbed. No footprints, no marks of any kind crossing it.</div></div><div class="evidence-list"><div class="evidence-item">Joel left barefoot — his only pair of boots was left in the tent.</div><div class="evidence-item">The flour ring was intact on all sides.</div><div class="evidence-item">The tent zip was open from the inside.</div><div class="evidence-item">Joel was a trained wilderness guide with fifteen years experience.</div></div>',
    question:"Joel vanished from inside a flour ring with no footprints crossing it. There is a rational explanation. <strong>How did he leave?</strong>",
    answers:["he jumped over it","he jumped","leapt over the flour","jumped over the ring","stepped over","long jump","he leaped","jumped across","jumped out","vaulted"],
    hint:"The ring was three metres wide. It was not three metres in every direction — it was a ring with a radius.",
    explain:"The flour ring had a three-metre radius — not three metres wide total. The diameter was six metres. Joel could have jumped or been grabbed and thrown from inside the ring to outside it without touching the flour. More simply: the ring description says three metres around the tent — Joel, in a panicked state, simply stepped over or jumped the ring himself (possibly barefoot and disoriented) without disturbing it, as the flour was on the ground and a step of sufficient length would clear it."
  },
  {
    diff:"Horror", diffClass:"extreme",
    body:'<div class="scene-block"><div class="scene-label">The Experiment</div><div class="scene-text">A scientist running a sleep deprivation study locks herself in a sealed lab at 11pm with enough food and water for five days. The lab has no windows. She sets an alarm to wake her every 90 minutes to record her mental state. At the 72-hour mark, her assistant observes through the one-way mirror that she is writing frantically. The journal reads:<br/><br/><em>"There is someone else in here with me. I have counted my food portions each morning: always one missing. I have not eaten it. I have checked every corner. There is no other door. The ventilation grate is seven centimetres wide."</em><br/><br/>The assistant reviews the CCTV footage from inside the lab. There is a six-hour gap in the recording — hours 48 to 54 — where the camera shows only static.</div></div><div class="evidence-list"><div class="evidence-item">The food count discrepancy began at hour 49 — within the CCTV gap.</div><div class="evidence-item">Sleep deprivation psychosis can begin as early as 72 hours.</div><div class="evidence-item">The CCTV system was installed by the same tech contractor who built the ventilation system.</div><div class="evidence-item">The scientist had published a controversial paper six months prior that threatened a major pharmaceutical company\'s patent.</div></div>',
    question:"The scientist is not going mad. Something real happened during those six hours. <strong>What actually occurred?</strong>",
    answers:["someone tampered with the cctv","cctv was hacked","the contractor sabotaged it","someone entered","someone got in","the camera was cut","deliberate gap","they entered during the gap","pharmaceutical company","sabotage","someone broke in during the gap","cctv gap was deliberate","contractor let someone in"],
    hint:"The CCTV contractor and the ventilation contractor are the same company. One of them had a reason to silence her. The gap is not a coincidence.",
    explain:"The CCTV gap was deliberate — the contractor disabled the camera remotely during a six-hour window. Someone entered the lab during those hours (likely using a concealed access point beyond the grate, or a key), ate one food portion to psychologically destabilise her, and left. The goal was to push the scientist into an apparent psychotic break, discrediting her research and her upcoming testimony against the pharmaceutical company that hired the contractor."
  },
  {
    diff:"Final Horror", diffClass:"final",
    body:'<div class="scene-block"><div class="scene-label">The Last Room</div><div class="scene-text">You have been in this room for what feels like hours. The walls are white. There is a single door with no handle on your side. On the wall, someone has scratched six words into the plaster with what looks like a fingernail:<br/><br/><strong style="color:var(--accent2);font-size:18px;letter-spacing:0.1em">"THE FIRST STEP IS ADMITTING IT"</strong><br/><br/>Below the words, there are eleven scratched tally marks. Below those, a final note:<br/><br/><em>"Everyone who has been in this room has tried the door first. It never opens. They scratch a mark. They read the message. They never understand it. You are the twelfth."</em></div></div><div class="scene-block"><div class="scene-label">The Only Clue</div><div class="scene-text">There is nothing else in the room. No window. No furniture. The floor is bare concrete. The light comes from nowhere visible. You are completely alone — except you notice, for the first time, that the door has a small panel at eye level. It is not a window. It is a keypad. It is waiting for a word.</div></div>',
    question:"Eleven people failed. The message tells you exactly what to type. <strong>What do you enter into the keypad?</strong>",
    answers:["i dont know","i do not know","i have no idea","i dont understand","i am lost","i give up","i am confused","lost","confused","i cant figure it out"],
    hint:"The message is not metaphorical. Read it as a literal instruction about what you must admit.",
    explain:"The first step is admitting that you do not know the answer. Every previous person tried to solve it — tried the door, scratched a mark, read the message, and tried to figure out the 'answer.' The keypad requires an admission of not knowing. Typing any variation of 'I don't know' or 'I have no idea' opens the door. The trap is that people keep trying to be clever when the answer requires humility."
  }
];
