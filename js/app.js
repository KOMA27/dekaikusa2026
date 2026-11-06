
let D=null, selectedMatchId='';
let currentDepartment = 'serious';
let seriousSelectedMatchId = '';
let teamTotalsVisible = false;
const $=id=>document.getElementById(id);

// ページ読み込み直後は必ずチーム合計得点を非表示にする。
document.body.classList.add('team-totals-hidden');

function toggleTeamTotals(){
  teamTotalsVisible = !teamTotalsVisible;
  document.body.classList.toggle('team-totals-hidden', !teamTotalsVisible);

  const button = $('teamTotalsToggle');
  if (button) {
    button.textContent = teamTotalsVisible ? '合計得点非表示' : '合計得点表示';
    button.setAttribute('aria-pressed', teamTotalsVisible ? 'true' : 'false');
  }
}
const esc=s=>String(s??'').replace(/[&<>"']/g,  c=>({
  '&':'&amp;',  '<':'&lt;',  '>':'&gt;',  '"':'&quot;',  "'":'&#39;'
}
[c]));
let githubToken = '';
const GITHUB_OWNER = location.pathname.split('/').filter(Boolean)[0] ? '' : '';
const GITHUB_REPO = 'dekaikusa2026_iidx';
const DATA_PATH = 'data/scores.json';
let repositoryOwner = '';
let fileSha = '';
let saveQueue = Promise.resolve();

function setGithubToken(){
  const value = prompt('GitHub Fine-grained Personal Access Tokenを入力してください。\\nトークンはこのページを開いている間だけメモリに保持します。');
  if(value === null) return;
  githubToken = value.trim();
  if(!githubToken){ toast('トークンを入力してください。'); return; }
  toast('トークンを一時設定しました。');
}
function getOwner(){
  if(repositoryOwner) return repositoryOwner;
  const parts = location.pathname.split('/').filter(Boolean);
  // GitHub Pages project site: username.github.io/repository/ ; custom domains need manual owner entry.
  const host = location.hostname;
  if(host.endsWith('.github.io')) return host.replace(/\.github\.io$/,'');
  const typed = prompt('GitHubユーザー名（リポジトリ所有者）を入力してください。');
  if(!typed) throw new Error('GitHubユーザー名が設定されていません。');
  repositoryOwner = typed.trim();
  return repositoryOwner;
}
function apiUrl(path){ return `https://api.github.com/repos/${encodeURIComponent(getOwner())}/${GITHUB_REPO}/contents/${path}`; }
async function githubRequest(url, options={}){
  const headers = {'Accept':'application/vnd.github+json', ...(options.headers||{})};
  if(githubToken) headers.Authorization = `Bearer ${githubToken}`;
  const response = await fetch(url,{...options,headers});
  const body = await response.json().catch(()=>({}));
  if(!response.ok){
    const message = body.message || `GitHub API error (${response.status})`;
    if(response.status===401||response.status===403) throw new Error('GitHub認証に失敗しました。トークンの有効期限・対象リポジトリ・Contents権限を確認してください。 '+message);
    if(response.status===409||response.status===422) throw new Error('データ更新が競合したか、GitHub側で拒否されました。再読み込みしてからもう一度お試しください。 '+message);
    throw new Error(message);
  }
  return body;
}
async function loadScores(){
  const owner=getOwner();
  const result=await githubRequest(apiUrl(DATA_PATH));
  if(!result.content) throw new Error('scores.jsonの内容を取得できません。');
  fileSha=result.sha;
  const decoded=decodeURIComponent(escape(atob(result.content.replace(/[\r\n]/g,''))));
  return JSON.parse(decoded);
}
function encodeBase64Utf8(value){ return btoa(unescape(encodeURIComponent(value))); }
async function persistScores(){
  saveQueue = saveQueue.catch(()=>{}).then(async()=>{
    if(!githubToken) throw new Error('保存するには管理者GitHubトークンを設定してください。');
    // Always refresh SHA immediately before update; refuse to overwrite unexpected changes.
    const latest=await githubRequest(apiUrl(DATA_PATH));
    if(fileSha && latest.sha!==fileSha){
      throw new Error('GitHub上のデータが別途更新されています。データを再読み込みしてから保存してください。');
    }
    const content=JSON.stringify({...D,updatedAt:new Date().toISOString()},null,2)+'\n';
    const updated=await githubRequest(apiUrl(DATA_PATH),{
      method:'PUT',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({message:'Update scores.json from admin app',content:encodeBase64Utf8(content),sha:latest.sha})
    });
    fileSha=updated.content.sha;
    D.updatedAt=new Date().toISOString();
    return {ok:true};
  });
  return saveQueue;
}
async function server(name,arg,done){
  const backup = D ? JSON.stringify(D) : null;
  try{
    let result;
    if(name==='saveMatch'){
      const p=arg; if(!p||!p.matchId) throw new Error('試合を選択してください。');
      const m=D.matches.find(x=>String(x['試合ID'])===String(p.matchId)); if(!m) throw new Error('対戦組み合わせが見つかりません。');
      const v=p.points||{}; const keys=['aOnA','aOnB','bOnA','bOnB'];
      keys.forEach(k=>{const n=Number(v[k]);if(!Number.isInteger(n)||n<0)throw new Error('獲得ポイントは0以上の整数で入力してください。');});
      const old=D.results.findIndex(x=>String(x['試合ID'])===String(p.matchId));
      const row={'試合ID':p.matchId,'ラウンド':m['ラウンド'],'対戦番号':m['対戦番号'],'AチームプレイヤーID':m['AチームプレイヤーID'],'BチームプレイヤーID':m['BチームプレイヤーID'],'A自選_Aチーム注文JSON':JSON.stringify({points:Number(v.aOnA)}),'A自選_Bチーム注文JSON':JSON.stringify({points:Number(v.aOnB)}),'B自選_Aチーム注文JSON':JSON.stringify({points:Number(v.bOnA)}),'B自選_Bチーム注文JSON':JSON.stringify({points:Number(v.bOnB)}),'Aチーム合計':Number(v.aOnA)+Number(v.bOnA),'Bチーム合計':Number(v.aOnB)+Number(v.bOnB),'更新日時':new Date().toISOString()};
      if(old>=0) D.results[old]=row; else D.results.push(row);
      await persistScores(); result={ok:true,totalA:row['Aチーム合計'],totalB:row['Bチーム合計']};
    } else if(name==='deleteMatchResult'){
      D.results=D.results.filter(x=>String(x['試合ID'])!==String(arg)); await persistScores(); result={ok:true};
    } else if(name==='saveSeriousMatch'){
      const p=arg; if(!p||!['S-R1','S-R2','S-R3','S-R4'].includes(String(p.matchId))) throw new Error('不正な試合IDです。');
      const cats={'S-R1':'SCRATCH','S-R2':'SCRATCH','S-R3':'CHARGE','S-R4':'CHORD'};
      if(p.category!==cats[p.matchId]) throw new Error('試合カテゴリが一致しません。');
      ['bp','ex'].forEach(mode=>{if(!p[mode]||!p[mode].songA||!p[mode].songB)throw new Error(mode+'のA・B自選曲を選択してください。');['aOnA','aOnB','bOnA','bOnB'].forEach(k=>{const n=Number(p[mode][k]);if(!Number.isInteger(n)||n<0)throw new Error('BP数・EXSCOREは0以上の整数で入力してください。');});});
      const per=String(p.matchId)==='S-R4'?2:1; let totalA=0,totalB=0;
      ['bp','ex'].forEach(mode=>{const cmp=(a,b,lower)=>{a=Number(a);b=Number(b);if(a===b){totalA+=per;totalB+=per;}else if((lower&&a<b)||(!lower&&a>b))totalA+=per;else totalB+=per;};cmp(p[mode].aOnA,p[mode].aOnB,mode==='bp');cmp(p[mode].bOnA,p[mode].bOnB,mode==='bp');});
      const row={matchId:p.matchId,category:p.category,bp:{...p.bp},ex:{...p.ex},totalA,totalB,updatedAt:new Date().toISOString()};
      const idx=D.seriousResults.findIndex(x=>String(x.matchId)===String(p.matchId));if(idx>=0)D.seriousResults[idx]=row;else D.seriousResults.push(row);
      await persistScores();result={ok:true,totalA,totalB};
    } else if(name==='deleteSeriousMatch'){
      D.seriousResults=D.seriousResults.filter(x=>String(x.matchId)!==String(arg));await persistScores();result={ok:true,deleted:true};
    } else { throw new Error('未対応の操作です: '+name); }
    if(typeof done==='function') done(result);
  }catch(e){if(backup) D=JSON.parse(backup);toast(name+'：'+(e&&e.message?e.message:String(e)));console.error(name,e);}
}

function toast(s){
  $('toast').textContent=s;
  $('toast').style.display='block';
  setTimeout(()=>$('toast').style.display='none',  3000)
}
async function reload(){
  try{
    const data=await loadScores();
    D={settings:Array.isArray(data.settings)?data.settings:[],players:Array.isArray(data.players)?data.players:[],matches:Array.isArray(data.matches)?data.matches:[],master:Array.isArray(data.master)?data.master:[],results:Array.isArray(data.results)?data.results:[],seriousResults:Array.isArray(data.seriousResults)?data.seriousResults:[],version:data.version||1,updatedAt:data.updatedAt||null};
    draw();
    if(!$('summary').classList.contains('hidden') && currentDepartment==='enjoy') summaryView();
    toast('GitHubからデータを読み込みました。');
  }catch(e){
    $('matches').textContent='データを読み込めませんでした。'+(e.message||e);
    toast('読み込み：'+(e.message||e));
    console.error(e);
  }
}

const SERIOUS_MATCHES = [
  {id:'S-R1', round:1, number:1, teamA:'謎男', teamB:'たむっちょ', category:'SCRATCH'},
  {id:'S-R2', round:2, number:1, teamA:'ちに', teamB:'池田', category:'SCRATCH'},
  {id:'S-R3', round:3, number:1, teamA:'Stasis', teamB:'フェオ', category:'CHARGE'},
  {id:'S-R4', round:4, number:1, teamA:'さしみ', teamB:'こまつな', category:'CHORD'}
];

const SERIOUS_SONGS = {
SCRATCH: [
  {"name": "199024club -Re:BounceKiller-", "difficulty": "ANOTHER"},
  {"name": "Be quiet", "difficulty": "LEGGENDARIA"},
  {"name": "BLACK.by X-Cross Fade", "difficulty": "ANOTHER"},
  {"name": "BLUE MIRAGE", "difficulty": "ANOTHER"},
  {"name": "Caterpillar", "difficulty": "ANOTHER"},
  {"name": "Cult Invitation", "difficulty": "ANOTHER"},
  {"name": "Don't believe the hype", "difficulty": "ANOTHER"},
  {"name": "Double Dribble", "difficulty": "ANOTHER"},
  {"name": "GAME ON", "difficulty": "ANOTHER"},
  {"name": "Level 2", "difficulty": "ANOTHER"},
  {"name": "Level 3", "difficulty": "ANOTHER"},
  {"name": "Level 4", "difficulty": "ANOTHER"},
  {"name": "Level 5", "difficulty": "ANOTHER"},
  {"name": "Level One", "difficulty": "ANOTHER"},
  {"name": "Lords Of The Roundtable", "difficulty": "ANOTHER"},
  {"name": "MAD ATTACK", "difficulty": "LEGGENDARIA"},
  {"name": "Miracle Synpho X", "difficulty": "LEGGENDARIA"},
  {"name": "Peaktime Booster", "difficulty": "ANOTHER"},
  {"name": "Plan 8", "difficulty": "ANOTHER"},
  {"name": "Purple Perplex", "difficulty": "ANOTHER"},
  {"name": "RAGE feat.H14 of LEONAIR", "difficulty": "ANOTHER"},
  {"name": "Red. by Full Metal Jacket", "difficulty": "ANOTHER"},
  {"name": "Red. by Jack Trance", "difficulty": "ANOTHER"},
  {"name": "SAMURAI-Scramble", "difficulty": "LEGGENDARIA"},
  {"name": "SAY BAY", "difficulty": "ANOTHER"},
  {"name": "SCREW // owo // SCREW", "difficulty": "ANOTHER"},
  {"name": "Skratch Education Lv-1", "difficulty": "ANOTHER"},
  {"name": "Snake Stick", "difficulty": "ANOTHER"},
  {"name": "The Chase", "difficulty": "ANOTHER"},
  {"name": "Watch Out Pt.2", "difficulty": "ANOTHER"},
  {"name": "WHA", "difficulty": "ANOTHER"},
  {"name": "Xperanza", "difficulty": "ANOTHER"},
  {"name": "バッド・スイーツ、バッド・ドリーム", "difficulty": "ANOTHER"},
  {"name": "灼熱 Lost Summer Dayz", "difficulty": "ANOTHER"},
  {"name": "灼熱 Pt.2 Long Train Running", "difficulty": "ANOTHER"},
  {"name": "灼熱Beach Side Bunny", "difficulty": "ANOTHER"},
  {"name": "灼熱Beach Side Bunny (かめりあ’s \"Summertime D’n’B\" Remix)", "difficulty": "ANOTHER"},
  {"name": "雪上断火", "difficulty": "ANOTHER"},
  {"name": "炎影", "difficulty": "ANOTHER"}
],
CHARGE: [
  {"name": "ABSOLUTE EVIL", "difficulty": "ANOTHER"},
  {"name": "Adularia", "difficulty": "ANOTHER"},
  {"name": "Aftermath", "difficulty": "ANOTHER"},
  {"name": "Almagest", "difficulty": "ANOTHER"},
  {"name": "BEAT PRISONER", "difficulty": "ANOTHER"},
  {"name": "BIGソムタム", "difficulty": "ANOTHER"},
  {"name": "Carmina", "difficulty": "ANOTHER"},
  {"name": "DIAMOND CROSSING", "difficulty": "ANOTHER"},
  {"name": "DIVINE JUDGEMENT", "difficulty": "ANOTHER"},
  {"name": "ECHIDNA", "difficulty": "ANOTHER"},
  {"name": "Everlasting Message", "difficulty": "ANOTHER"},
  {"name": "Hollywood Galaxy", "difficulty": "ANOTHER"},
  {"name": "Ignis†Ira", "difficulty": "ANOTHER"},
  {"name": "LOCUS OF THE TRAVEL", "difficulty": "ANOTHER"},
  {"name": "NOIXIA", "difficulty": "ANOTHER"},
  {"name": "NZM", "difficulty": "ANOTHER"},
  {"name": "Painful Fate", "difficulty": "ANOTHER"},
  {"name": "Papilio ulysses", "difficulty": "ANOTHER"},
  {"name": "PARADISE LOST", "difficulty": "ANOTHER"},
  {"name": "Reflux", "difficulty": "ANOTHER"},
  {"name": "REVOLVER", "difficulty": "LEGGENDARIA"},
  {"name": "Sinus Iridum", "difficulty": "ANOTHER"},
  {"name": "Snakey Kung-fu", "difficulty": "ANOTHER"},
  {"name": "SOMETHING", "difficulty": "ANOTHER"},
  {"name": "Steel Edge", "difficulty": "ANOTHER"},
  {"name": "Timepiece phase II (CN Ver.)", "difficulty": "ANOTHER"},
  {"name": "TITANS RETURN", "difficulty": "LEGGENDARIA"},
  {"name": "TOGAKUSHI", "difficulty": "ANOTHER"},
  {"name": "Triple Cross", "difficulty": "ANOTHER"},
  {"name": "TRIUMPH", "difficulty": "ANOTHER"},
  {"name": "Umbral", "difficulty": "LEGGENDARIA"},
  {"name": "Unbelief", "difficulty": "ANOTHER"},
  {"name": "Valanga", "difficulty": "ANOTHER"},
  {"name": "ディスコルディア", "difficulty": "ANOTHER"},
  {"name": "ミラージュ・レジデンス", "difficulty": "LEGGENDARIA"},
  {"name": "栄冠のカンパネラ", "difficulty": "ANOTHER"},
  {"name": "海神", "difficulty": "LEGGENDARIA"},
  {"name": "共鳴遊戯の華", "difficulty": "ANOTHER"},
  {"name": "蛇神", "difficulty": "LEGGENDARIA"},
  {"name": "新宝島", "difficulty": "LEGGENDARIA"},
  {"name": "深淵に捧ぐレクイエム", "difficulty": "ANOTHER"},
  {"name": "真 地獄超特急 -HELL or HELL-", "difficulty": "ANOTHER"},
  {"name": "神のシナリオ", "difficulty": "ANOTHER"},
  {"name": "水鏡の異界", "difficulty": "ANOTHER"},
  {"name": "廿", "difficulty": "ANOTHER"},
  {"name": "魔法のかくれんぼ", "difficulty": "ANOTHER"},
  {"name": "龍王の霊廟(Mausoleum Of The Primal Dragon)", "difficulty": "LEGGENDARIA"},
  {"name": "焔", "difficulty": "LEGGENDARIA"},
  {"name": "烽火連天の刃", "difficulty": "ANOTHER"}
],
CHORD: [
  {"name": "#The_Relentless", "difficulty": "LEGGENDARIA"},
  {"name": "〆", "difficulty": "ANOTHER"},
  {"name": "A MINSTREL ～ ver. short-scape ～", "difficulty": "LEGGENDARIA"},
  {"name": "ÆTHER", "difficulty": "LEGGENDARIA"},
  {"name": "AKASHIC BREAK", "difficulty": "ANOTHER"},
  {"name": "ALBA -黎明-", "difficulty": "LEGGENDARIA"},
  {"name": "ALBIDA", "difficulty": "ANOTHER"},
  {"name": "ALTERNATOR", "difficulty": "ANOTHER"},
  {"name": "Amazing Mirage", "difficulty": "LEGGENDARIA"},
  {"name": "Anisakis -somatic mutation type\"Forza\"-", "difficulty": "LEGGENDARIA"},
  {"name": "B4U(BEMANI FOR YOU MIX)", "difficulty": "LEGGENDARIA"},
  {"name": "Beat Radiance", "difficulty": "LEGGENDARIA"},
  {"name": "BIGWAVERS", "difficulty": "ANOTHER"},
  {"name": "BITTER CHOCOLATE STRIKER", "difficulty": "ANOTHER"},
  {"name": "Boomy and The Boost", "difficulty": "ANOTHER"},
  {"name": "Bow shock!!", "difficulty": "LEGGENDARIA"},
  {"name": "BroGamer", "difficulty": "LEGGENDARIA"},
  {"name": "CHRONO DIVER -NORNIR-", "difficulty": "LEGGENDARIA"},
  {"name": "Cosmic Cat", "difficulty": "LEGGENDARIA"},
  {"name": "DARK LEGACY", "difficulty": "ANOTHER"},
  {"name": "Despair of ELFERIA", "difficulty": "ANOTHER"},
  {"name": "Dynamite", "difficulty": "ANOTHER"},
  {"name": "Elemental Creation", "difficulty": "ANOTHER"},
  {"name": "eRAseRmOToRpHAntOM", "difficulty": "ANOTHER"},
  {"name": "EX-MASSIVE FIGHTER", "difficulty": "ANOTHER"},
  {"name": "G59", "difficulty": "ANOTHER"},
  {"name": "GO OVER WITH GLARE -ROOTAGE 26-", "difficulty": "ANOTHER"},
  {"name": "GRID KNIGHT", "difficulty": "LEGGENDARIA"},
  {"name": "Here We Go Now", "difficulty": "ANOTHER"},
  {"name": "INAZUMA", "difficulty": "LEGGENDARIA"},
  {"name": "Initiation", "difficulty": "ANOTHER"},
  {"name": "INSOMNIA", "difficulty": "ANOTHER"},
  {"name": "JUSTICE/GUILTY feat. Nana Takahashi & 709sec.", "difficulty": "ANOTHER"},
  {"name": "KING", "difficulty": "LEGGENDARIA"},
  {"name": "Kung-fu Empire", "difficulty": "LEGGENDARIA"},
  {"name": "Little Little Princess", "difficulty": "LEGGENDARIA"},
  {"name": "LIVE DRIVING!! feat. 花たん", "difficulty": "ANOTHER"},
  {"name": "M4K3 1T BOUNC3", "difficulty": "ANOTHER"},
  {"name": "Marie Antoinette", "difficulty": "LEGGENDARIA"},
  {"name": "mosaic", "difficulty": "ANOTHER"},
  {"name": "NEO GENERATOR SEVEN", "difficulty": "ANOTHER"},
  {"name": "NNRT", "difficulty": "ANOTHER"},
  {"name": "Override", "difficulty": "LEGGENDARIA"},
  {"name": "PLASMA SOUL NIGHT feat. Nana Takahashi / 709sec.", "difficulty": "ANOTHER"},
  {"name": "Rampage", "difficulty": "ANOTHER"},
  {"name": "Rave*it!! Rave*it!!", "difficulty": "ANOTHER"},
  {"name": "reunion", "difficulty": "ANOTHER"},
  {"name": "RINNE", "difficulty": "ANOTHER"},
  {"name": "rommmo", "difficulty": "ANOTHER"},
  {"name": "Say YEEEAHH", "difficulty": "ANOTHER"},
  {"name": "Secrets", "difficulty": "LEGGENDARIA"},
  {"name": "SOLID STATE SQUAD", "difficulty": "LEGGENDARIA"},
  {"name": "Sounds Of Summer", "difficulty": "ANOTHER"},
  {"name": "Super Rush", "difficulty": "ANOTHER"},
  {"name": "THE BRAVE MUST DIE", "difficulty": "ANOTHER"},
  {"name": "THE DEEP STRIKER", "difficulty": "LEGGENDARIA"},
  {"name": "The Onlyonez", "difficulty": "ANOTHER"},
  {"name": "thunder HOUSE NATION Remix", "difficulty": "LEGGENDARIA"},
  {"name": "Thunderbolt", "difficulty": "ANOTHER"},
  {"name": "Time to Air", "difficulty": "LEGGENDARIA"},
  {"name": "Triple Counter", "difficulty": "ANOTHER"},
  {"name": "TROOPERS", "difficulty": "ANOTHER"},
  {"name": "Venom", "difficulty": "ANOTHER"},
  {"name": "VOX UP", "difficulty": "ANOTHER"},
  {"name": "waxing and wanding", "difficulty": "LEGGENDARIA"},
  {"name": "Welcome", "difficulty": "LEGGENDARIA"},
  {"name": "グッバイ宣言", "difficulty": "LEGGENDARIA"},
  {"name": "スパークリング☆ハイパーチューン！！", "difficulty": "ANOTHER"},
  {"name": "フォニイ", "difficulty": "LEGGENDARIA"},
  {"name": "仮想空間の旅人たち", "difficulty": "LEGGENDARIA"},
  {"name": "華麗風雪", "difficulty": "LEGGENDARIA"},
  {"name": "逆月", "difficulty": "ANOTHER"},
  {"name": "九尾狐夜行", "difficulty": "ANOTHER"},
  {"name": "残像ニ繋ガレタ追憶ノHIDEAWAY", "difficulty": "ANOTHER"},
  {"name": "世界の果てに約束の凱歌を -ReUnion-", "difficulty": "ANOTHER"},
  {"name": "千年ノ理", "difficulty": "LEGGENDARIA"},
  {"name": "表裏一体！？怪盗いいんちょの悩み♥", "difficulty": "LEGGENDARIA"}
]
};

function switchDepartment(value){
  currentDepartment = value === 'serious' ? 'serious' : 'enjoy';
  $('departmentLabel').textContent = currentDepartment === 'serious'
    ? 'beatmania IIDX ガチ部門' : 'beatmania IIDX エンジョイ部門';
  $('summaryButton').style.display = currentDepartment === 'enjoy' ? '' : 'none';
  $('allA').textContent = '0 pt';
  $('allB').textContent = '0 pt';
  selectedMatchId = '';
  seriousSelectedMatchId = '';
  $('summary').classList.add('hidden');
  $('editor').classList.remove('hidden');
  draw();
}

function seriousResult(id){
  return (D.seriousResults || []).find(x => String(x.matchId) === String(id)) || null;
}
function seriousMatch(id){
  return SERIOUS_MATCHES.find(x => x.id === id);
}
function seriousDraw(){
  let totalA=0,totalB=0;
  (D.seriousResults||[]).forEach(r=>{totalA+=Number(r.totalA||0);totalB+=Number(r.totalB||0);});
  $('allA').textContent=totalA+' pt';
  $('allB').textContent=totalB+' pt';
  $('matches').innerHTML=SERIOUS_MATCHES.map(m=>{
    const r=seriousResult(m.id);
    return `<button class="match ${seriousSelectedMatchId===m.id?'active':''}" onclick="openSeriousMatch('${m.id}')">
      第${m.round}ラウンド / 第${m.number}試合
      <small>${esc(m.teamA)} vs ${esc(m.teamB)}（${m.category}）</small>
      <small>${r?'入力済み':'未入力'}</small>
    </button>`;
  }).join('');
}
function openSeriousMatch(id){
  seriousSelectedMatchId=id;
  $('summary').classList.add('hidden');
  $('editor').classList.remove('hidden');
  seriousDraw();
  renderSeriousEditor();
}
function seriousOptions(category, selected){
  return '<option value="">課題曲を選択</option>' +
    (SERIOUS_SONGS[category]||[]).map(song=>{
      const value = song.name + ' [' + song.difficulty + ']';
      const isSelected = selected === value || selected === song.name;
      return `<option value="${esc(value)}" ${isSelected?'selected':''}>${esc(song.name)}（${esc(song.difficulty)}）</option>`;
    }).join('');
}
function seriousScoreField(id,label,value){
  return `<div class="field" id="${id}Wrap"><label>${esc(label)}</label><input type="number" min="0" step="1" id="${id}" value="${Number(value)||0}" inputmode="numeric" oninput="updateSeriousPreview()"></div>`;
}
function seriousModeForm(prefix,title,category,data,playerA,playerB){
  const metric=prefix==='bp'?'BP数':'EXSCORE';
  const songA=data.songA||'';
  const songB=data.songB||'';
  return `<div class="block" id="${prefix}BattleBlock">
    <div class="blockHead"><h3>${title}</h3><span class="tag">${category}</span></div>
    <div class="plays">
      <div class="play a"><h4>Aチーム自選曲</h4><div class="field"><select id="${prefix}SongA" onchange="updateSeriousPreview()">${seriousOptions(category,songA)}</select></div></div>
      <div class="play b"><h4>Bチーム自選曲</h4><div class="field"><select id="${prefix}SongB" onchange="updateSeriousPreview()">${seriousOptions(category,songB)}</select></div></div>
    </div>
    <div class="songResult">
      <h4>Aチーム自選曲：<span class="songName" id="${prefix}SongALabel">${esc(songA||'未選択')}</span></h4>
      <div class="fields">
        ${seriousScoreField(prefix+'AonA','Aチーム：'+playerA+' '+metric,data.aOnA)}
        ${seriousScoreField(prefix+'AonB','Bチーム：'+playerB+' '+metric,data.aOnB)}
      </div>
      <div class="resultStatus" id="${prefix}ResultA">数値を入力すると勝敗を表示します</div>
    </div>
    <div class="songResult">
      <h4>Bチーム自選曲：<span class="songName" id="${prefix}SongBLabel">${esc(songB||'未選択')}</span></h4>
      <div class="fields">
        ${seriousScoreField(prefix+'BonA','Aチーム：'+playerA+' '+metric,data.bOnA)}
        ${seriousScoreField(prefix+'BonB','Bチーム：'+playerB+' '+metric,data.bOnB)}
      </div>
      <div class="resultStatus" id="${prefix}ResultB">数値を入力すると勝敗を表示します</div>
    </div>
  </div>`;
}
function renderSeriousEditor(){
  const m=seriousMatch(seriousSelectedMatchId); if(!m)return;
  const r=seriousResult(m.id)||{};
  $('editor').innerHTML=`<div class="editorHead"><div><strong>第${m.round}ラウンド / 第${m.number}試合</strong><div class="sub">${esc(m.teamA)}（A） vs ${esc(m.teamB)}（B）</div></div><span class="tag">${r.matchId?'保存済み・編集可能':'新規入力'}</span></div>
    <div class="hint">カテゴリ：${m.category} ／ 課題曲はこのカテゴリから選択します。${m.id==='S-R4'?' ／ 大将戦：1曲の勝利につき2pt（引き分けは両チーム2pt）':' ／ 通常戦：1曲の勝利につき1pt（引き分けは両チーム1pt）'}</div>
    ${seriousModeForm('bp','BP数バトル',m.category,r.bp||{},m.teamA,m.teamB)}
    ${seriousModeForm('ex','EXSCOREバトル',m.category,r.ex||{},m.teamA,m.teamB)}
    <div class="grand" id="seriousMatchGrandTotal"><h3>試合の合計得点</h3><div class="totals"><div class="total a">Aチーム：${esc(m.teamA)}<b id="seriousTotalA">${Number(r.totalA)||0} pt</b></div><div class="total b">Bチーム：${esc(m.teamB)}<b id="seriousTotalB">${Number(r.totalB)||0} pt</b></div></div><div class="hint">BPは少ない方、EXSCOREは多い方が勝利です。勝者を各曲の下に表示します。</div></div>
    <div class="actions">${r.matchId?`<button class="ghost" onclick="deleteSeriousResult('${m.id}')">保存データを削除</button>`:''}<button class="primary" onclick="saveSeriousMatch()">この試合を保存・更新</button></div>`;
  updateSeriousPreview();
}
function updateSeriousPreview(){
  const m=seriousMatch(seriousSelectedMatchId); if(!m)return;
  let totalA=0,totalB=0;
  const perSong=m.id==='S-R4'?2:1;
  const compare=(prefix,suffixA,suffixB,lowerWins,statusId)=>{
    const aEl=$(prefix+suffixA), bEl=$(prefix+suffixB);
    const wrapA=$(prefix+suffixA+'Wrap'), wrapB=$(prefix+suffixB+'Wrap');
    if(wrapA)wrapA.classList.remove('songWinner');
    if(wrapB)wrapB.classList.remove('songWinner');
    const a=aEl&&aEl.value!==''?Number(aEl.value):null;
    const b=bEl&&bEl.value!==''?Number(bEl.value):null;
    const status=$(statusId);
    if(a===null||b===null||!Number.isFinite(a)||!Number.isFinite(b)){
      status.className='resultStatus';status.textContent='両チームの数値を入力してください';return;
    }
    if(a===b){totalA+=perSong;totalB+=perSong;status.className='resultStatus draw';status.textContent=`引き分け：両チーム +${perSong}pt`;}
    else if((lowerWins&&a<b)||(!lowerWins&&a>b)){
      totalA+=perSong;if(wrapA)wrapA.classList.add('songWinner');status.className='resultStatus winA';status.textContent=`🏆 Aチーム ${m.teamA} の勝利（+${perSong}pt）`;
    }else{
      totalB+=perSong;if(wrapB)wrapB.classList.add('songWinner');status.className='resultStatus winB';status.textContent=`🏆 Bチーム ${m.teamB} の勝利（+${perSong}pt）`;
    }
  };
  ['bp','ex'].forEach(prefix=>{
    const songA=$(prefix+'SongA'),songB=$(prefix+'SongB');
    const labelA=$(prefix+'SongALabel'),labelB=$(prefix+'SongBLabel');
    if(labelA)labelA.textContent=songA&&songA.value?songA.options[songA.selectedIndex].text:'未選択';
    if(labelB)labelB.textContent=songB&&songB.value?songB.options[songB.selectedIndex].text:'未選択';
    const lowerWins=prefix==='bp';
    compare(prefix,prefix==='bp'?'AonA':'AonA',prefix==='bp'?'AonB':'AonB',lowerWins,prefix+'ResultA');
    compare(prefix,'BonA','BonB',lowerWins,prefix+'ResultB');
  });
  const totalAEl=$('seriousTotalA'),totalBEl=$('seriousTotalB');
  if(totalAEl)totalAEl.textContent=totalA+' pt';
  if(totalBEl)totalBEl.textContent=totalB+' pt';
}
function num(id){const el=$(id);if(!el||el.value==='')return 0;const n=Number(el.value);return Number.isFinite(n)&&n>=0?Math.floor(n):0;}
function saveSeriousMatch(){
  const m=seriousMatch(seriousSelectedMatchId);if(!m)return;
  const payload={matchId:m.id,category:m.category,
    bp:{songA:$('bpSongA')?.value||'',songB:$('bpSongB')?.value||'',aOnA:num('bpAonA'),aOnB:num('bpAonB'),bOnA:num('bpBonA'),bOnB:num('bpBonB')},
    ex:{songA:$('exSongA')?.value||'',songB:$('exSongB')?.value||'',aOnA:num('exAonA'),aOnB:num('exAonB'),bOnA:num('exBonA'),bOnB:num('exBonB')}
  };
  server('saveSeriousMatch',payload,result=>{
    if(!result||!result.ok){toast('ガチ部門の保存に失敗しました。');return;}
    toast('ガチ部門を保存しました。');
    reload();
    setTimeout(()=>openSeriousMatch(m.id),400);
  });
}
function deleteSeriousResult(id){
  if(!confirm('この試合のガチ部門保存データを削除しますか？'))return;
  server('deleteSeriousMatch',id,result=>{
    if(result&&result.ok){toast('削除しました。');reload();}else toast('削除できませんでした。');
  });
}

function person(id){
  return D.players.find(p=>String(p['プレイヤーID'])===String(id))||{
  }
}
function rec(id){
  return D.results.find(x=>String(x['試合ID'])===String(id))||null
}
function match(id){
  return D.matches.find(x=>String(x['試合ID'])===String(id))
}
function draw(){
  if (currentDepartment === 'serious') { seriousDraw(); if (seriousSelectedMatchId) renderSeriousEditor(); return; }
  if (!D) {
    $('matches').textContent = 'データを読み込めませんでした。';
    return;
  }

  let a=0,  b=0;
  D.results.forEach(x=>{
    a+=Number(x['Aチーム合計']||0);
    b+=Number(x['Bチーム合計']||0)
  });
  $('allA').textContent=a+' pt';
  $('allB').textContent=b+' pt';
  $('matches').innerHTML=[...D.matches].sort((x,  y)=>+x['ラウンド']-+y['ラウンド']||+x['対戦番号']-+y['対戦番号']).map(m=>{
    let r=rec(m['試合ID']);
    return `<button class="match ${selectedMatchId===String(m['試合ID'])?'active':''}" onclick="openMatch('${esc(m['試合ID'])}')">第${esc(m['ラウンド'])}ラウンド / 第${esc(m['対戦番号'])}試合<small>${esc(person(m['AチームプレイヤーID'])['プレイヤー名'])} vs ${esc(person(m['BチームプレイヤーID'])['プレイヤー名'])}</small>
<small>${r?'入力済み':'未入力'}</small>
</button>`
  }).join('')||'対戦組み合わせがありません。';
  if(selectedMatchId)renderEditor();
}
function rankGroup(r){
  r=String(r||'');
  if(/皆伝/.test(r))return'皆伝';
  if(/十段|中伝/.test(r))return'十段〜中伝';
  if(/九段|八段|七段|六段|五段|四段|三段|二段|初段|級|未取得/.test(r))return'九段まで';
  return''
}
function options(cat,  value,  rank){
  let rows=D.master.filter(x=>String(x['分類'])===cat);
  if(cat==='難易度'){
    let exact=rows.filter(x=>String(x['対象段位'])===String(rank||'')),  group=rows.filter(x=>String(x['対象段位'])===rankGroup(rank)),  all=rows.filter(x=>String(x['対象段位'])==='全段位');
    rows=exact.length?exact:(group.length?group:all)
  }
  return '<option value="">選択してください</option>'+rows.map(x=>`<option value="${esc(x['選択肢'])}" ${String(value||'')===String(x['選択肢'])?'selected':''}>${esc(x['選択肢'])}（${esc(x['ポイント'])}${cat==='救済チケット'?'倍':'pt'}）</option>`).join('')
}
function parse(s){
  try{
    return JSON.parse(s||'{}')
  } catch(e){
    return {
    }
  }
}
function openMatch(id){
  selectedMatchId=id;
  $('summary').classList.add('hidden');
  $('editor').classList.remove('hidden');
  draw();
  renderEditor()
}
function renderEditor(){
  const m = match(selectedMatchId);
  if (!m) return;

  const r = rec(selectedMatchId) || {};
  const a = person(m['AチームプレイヤーID']);
  const b = person(m['BチームプレイヤーID']);

  const aOnA = savedPoints(r['A自選_Aチーム注文JSON']);
  const aOnB = savedPoints(r['A自選_Bチーム注文JSON']);
  const bOnA = savedPoints(r['B自選_Aチーム注文JSON']);
  const bOnB = savedPoints(r['B自選_Bチーム注文JSON']);

  $('editor').innerHTML = `<div class="editorHead">
    <div>
      <strong>第${esc(m['ラウンド'])}ラウンド / 第${esc(m['対戦番号'])}試合</strong>
      <div class="sub">${esc(a['プレイヤー名'])}（A） vs ${esc(b['プレイヤー名'])}（B）</div>
    </div>
    <span class="tag">${r['試合ID'] ? '保存済み・編集可能' : '新規入力'}</span>
  </div>

  <div class="block">
    <div class="blockHead"><h3>Aチーム自選曲</h3><span class="tag">A・B両選手の獲得ポイント</span></div>
    <div class="plays">
      ${pointInput('aOnA', 'Aチーム', a['プレイヤー名'], aOnA)}
      ${pointInput('aOnB', 'Bチーム', b['プレイヤー名'], aOnB)}
    </div>
  </div>

  <div class="block">
    <div class="blockHead"><h3>Bチーム自選曲</h3><span class="tag">A・B両選手の獲得ポイント</span></div>
    <div class="plays">
      ${pointInput('bOnA', 'Aチーム', a['プレイヤー名'], bOnA)}
      ${pointInput('bOnB', 'Bチーム', b['プレイヤー名'], bOnB)}
    </div>
  </div>

  <div class="grand">
    <h3>この試合の合計獲得ポイント</h3>
    <div class="totals">
      <div class="total a">TEAM A<b id="matchA">${aOnA+bOnA} pt</b></div>
      <div class="total b">TEAM B<b id="matchB">${aOnB+bOnB} pt</b></div>
    </div>
  </div>
  <div class="actions">
    <button class="ghost" onclick="renderEditor()">保存前の変更を戻す</button>
    ${r['試合ID'] ? `<button class="ghost" style="border-color:#d85a6a;color:#ffdce1" onclick="deleteMatchResult('${esc(selectedMatchId)}')">保存データを削除</button>` : ''}
    <button class="primary" onclick="save()">この試合を保存・更新</button>
  </div>`;

  ['aOnA','aOnB','bOnA','bOnB'].forEach(id => $(id).addEventListener('input', live));
  live();
}

function savedPoints(json){
  const value = parse(json);
  const n = Number(value && (value.points ?? value.earned));
  return Number.isFinite(n) ? n : 0;
}

function pointInput(key, team, playerName, value){
  return `<div class="play ${team === 'Aチーム' ? 'a' : 'b'}">
    <h4>${team}：${esc(playerName)}</h4>
    <div class="field">
      <label>獲得ポイント</label>
      <input id="${key}" type="number" min="0" step="1" inputmode="numeric" value="${Number(value)||0}" placeholder="ポイントを入力">
    </div>
  </div>`;
}

function live(){
  if (!selectedMatchId) return;
  const aOnA = readPoint('aOnA');
  const aOnB = readPoint('aOnB');
  const bOnA = readPoint('bOnA');
  const bOnB = readPoint('bOnB');

  $('matchA').textContent = (aOnA + bOnA) + ' pt';
  $('matchB').textContent = (aOnB + bOnB) + ' pt';
}

function readPoint(id){
  const value = Number($(id).value);
  return Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0;
}

function save(){
  if (!selectedMatchId) {
    toast('保存する試合を選択してください。');
    return;
  }

  const payload = {
    matchId: selectedMatchId,
    points: {
      aOnA: readPoint('aOnA'),
      aOnB: readPoint('aOnB'),
      bOnA: readPoint('bOnA'),
      bOnB: readPoint('bOnB')
    }
  };

  server('saveMatch', payload, result => {
    if (!result || result.ok !== true) {
      toast('保存結果を確認できませんでした。');
      return;
    }
    toast('保存しました。Aチーム ' + result.totalA + ' pt ／ Bチーム ' + result.totalB + ' pt');
    reload();
  });
}

function deleteMatchResult(matchId){
  const target = match(matchId);
  if (!target) {
    toast('対象の試合が見つかりません。');
    return;
  }

  const label = `第${target['ラウンド']}ラウンド／第${target['対戦番号']}試合`;
  if (!confirm(`${label} の保存済み結果を削除します。\\n試合の組み合わせやプレイヤー情報は削除されません。\\nよろしいですか？`)) {
    return;
  }

  server('deleteMatchResult', matchId, result => {
    if (!result || result.ok !== true) {
      toast('保存データを削除できませんでした。');
      return;
    }
    toast('保存済みの試合結果を削除しました。');
    if (String(selectedMatchId) === String(matchId)) {
      selectedMatchId = '';
      $('editor').innerHTML = '<div class="hint">左側の試合一覧から試合を選択してください。</div>';
    }
    reload();
  });
}
function summaryView(){
  $('editor').classList.add('hidden');
  $('summary').classList.remove('hidden');
  let A=0,  B=0,  rows=[...D.matches].sort((a,  b)=>+a['ラウンド']-+b['ラウンド']||+a['対戦番号']-+b['対戦番号']).map(m=>{
    let r=rec(m['試合ID']),  a=Number(r?.['Aチーム合計']||0),  b=Number(r?.['Bチーム合計']||0);
    A+=a;
    B+=b;
    return `<tr>
<td>第${esc(m['ラウンド'])}R・${esc(m['対戦番号'])}試合</td>
<td>${esc(person(m['AチームプレイヤーID'])['プレイヤー名'])} vs ${esc(person(m['BチームプレイヤーID'])['プレイヤー名'])}</td>
<td>${r?'入力済み':'未入力'}</td>
<td>${a} pt</td>
<td>${b} pt</td>
<td>
<button class="ghost" onclick="openMatch('${esc(m['試合ID'])}')">編集</button>
${r?` <button class="ghost" style="border-color:#d85a6a;color:#ffdce1" onclick="deleteMatchResult('${esc(m['試合ID'])}')">保存データ削除</button>`:''}
</td>
</tr>`
  }).join('');
  $('summary').innerHTML=`<h2>全体集計</h2>
<table class="summary">
<thead>
<tr>
<th>試合</th>
<th>対戦</th>
<th>状態</th>
<th>Aチーム</th>
<th>Bチーム</th>
<th>
</th>
</tr>
</thead>
<tbody>${rows}</tbody>
</table>
<div class="grand">
<h3>大会総得点</h3>
<div class="totals">
<div class="total a">TEAM A<b>${A} pt</b>
</div>
<div class="total b">TEAM B<b>${B} pt</b>
</div>
</div>
</div>`
}
reload();
