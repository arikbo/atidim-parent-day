import {initializeApp} from 'https://www.gstatic.com/firebasejs/11.6.0/firebase-app.js';
import {getAuth,GoogleAuthProvider,signInWithPopup,signInWithRedirect,getRedirectResult,onAuthStateChanged,signOut} from 'https://www.gstatic.com/firebasejs/11.6.0/firebase-auth.js';
import {getFirestore,doc,getDoc,getDocs,setDoc,addDoc,updateDoc,deleteDoc,collection,query,where,serverTimestamp,writeBatch} from 'https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js';
import {firebaseConfig} from './firebase-config.js';
const el = id => document.getElementById(id);
const esc = s => String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const safeId = s => String(s??'').trim().replaceAll('/','-').replace(/[^\p{L}\p{N}_-]/gu,'_').slice(0,90);
const number = v => Number(v)||0;
const mk = (tag, props={},children='') => `<${tag} ${Object.entries(props).map(([k,v])=>`${k}="${esc(v)}"`).join(' ')}>${children}</${tag}>`;
const formatError = err => String(err?.message||err).replace('Firebase:','').slice(0,320);
const subjectNormalize = s => String(s||'').replace(/\s*\([^)]*\)/g,'').replace(/[`׳״]/g,'').trim();
const gradeOf = c => c.replace(/[0-9\s'׳"״]/g,'').trim().slice(0,1);
let app,auth,db,user,profile,currentTab='assess',catalog=[],myAssignments=[],myStudents=[],myAssessments=[],currentRoster=[],currentAssessments=[],activeClass='',activeStudent='',currentReports=[],staged=[],stagedType='';
const configReady = firebaseConfig.apiKey !== 'PASTE_API_KEY' && !firebaseConfig.projectId.includes('PASTE');
const status = (msg,error=false) => { const box=el('status'); if(box){box.textContent=msg;box.className=error?'warning error':'notice'} };
const hero = (title,desc,extra='') => {el('main').innerHTML=`<section class="hero"><div class="eyebrow">תמונת תלמיד • עתידים</div><h1>${title}</h1><p>${desc}</p>${extra}</section>`};
function field(label,id,options){return `<div class="field"><label for="${id}">${label}</label>${options}</div>`}
function opts(arr,placeholder='בחירה'){return `<option value="">${placeholder}</option>`+arr.map(x=>`<option value="${esc(x.value??x)}">${esc(x.label??x)}</option>`).join('')}
const canManageClass = (c,g) => profile?.role==='admin' || (profile?.role==='coordinator' && profile.grades?.includes(g)) || (profile?.role==='homeroom' && profile.classes?.includes(c));
function showAuth(){el('account').innerHTML=user?`<small>${esc(user.email)}</small><button class="secondary" id="logout">יציאה</button>`:'';el('logout')?.addEventListener('click',()=>signOut(auth));}
async function login(){try{await signInWithPopup(auth,new GoogleAuthProvider())}catch(e){if(e.code==='auth/popup-blocked')await signInWithRedirect(auth,new GoogleAuthProvider());else status(formatError(e),true)}}
async function boot(){
 if(!configReady){hero('צריך לחבר את Firebase','הקוד מוכן. כדי להפעיל אותו עם כניסה אמיתית של מורים, יש להדביק את פרטי הפרויקט בקובץ firebase-config.js.','<div class="notice">אין להעלות קובצי תלמידים ל-GitHub. מתחילים בנתוני דוגמה בלבד.</div><a href="README.html">הוראות ההתקנה</a>');return}
 app=initializeApp(firebaseConfig);auth=getAuth(app);db=getFirestore(app);
 await getRedirectResult(auth).catch(()=>{});
 onAuthStateChanged(auth, async u=>{user=u;showAuth();if(!u){profile=null;hero('כל תלמיד. כל המקצועות. עמוד אחד.','למורים ולמחנכים — התחברות חינמית ומאובטחת באמצעות Google.','<button id="login">כניסה עם Google</button>');el('login').onclick=login;return}
  try{const p=await getDoc(doc(db,'profiles',u.uid)); profile=p.exists()?p.data():null;if(!profile){await registerScreen();return}if(profile.status!=='approved'){await pendingScreen();return}await loadCatalog();await openApp()}catch(e){hero('שגיאה בקריאת ההרשאות',esc(formatError(e)))}
 });
}
async function registerScreen(){
 const all=await getDocs(collection(db,'teacherCatalog')).catch(()=>null);
 const names=all?all.docs.map(x=>({value:x.id,label:x.data().name})):[];
 hero('הצטרפות ראשונה','החשבון שלך אומת. בחר/י את שמך. מנהל המערכת יאשר לפני שתוכל/י לראות מידע של תלמידים.',
 field('שם המורה','requestedName',names.length?`<select id="requestedName">${opts(names,'בחר/י שם מהרשימה')}</select>`:`<input id="requestedName" placeholder="שם מלא כפי שמופיע בסמארט" maxlength="100">`)+`<div class="actions"><button id="join">שליחת בקשת הצטרפות</button></div><div id="status"></div>`);
 el('join').onclick=async()=>{let name=el('requestedName').value.trim();if(!name)return status('יש לבחור שם.',true);try{await setDoc(doc(db,'profiles',user.uid),{email:user.email,displayName:user.displayName||'',requestedTeacherName:name,status:'pending',createdAt:serverTimestamp()});profile={status:'pending'};await pendingScreen()}catch(e){status(formatError(e),true)}};
}
async function pendingScreen(){hero('הבקשה התקבלה','החשבון זוהה בהצלחה. כעת יש להמתין לאישור מנהל המערכת. עד לאישור לא ניתן לצפות בנתוני תלמידים.',`<div class="notice">חשבון: ${esc(user.email)}<br>בקשת השיוך: ${esc(profile.requestedTeacherName||'')}</div><button id="refresh">בדיקת אישור מחדש</button>`);el('refresh').onclick=async()=>{const d=await getDoc(doc(db,'profiles',user.uid));profile=d.data();if(profile.status==='approved'){await loadCatalog();openApp()}else alert('עדיין ממתין לאישור')};}
async function loadCatalog(){catalog=(await getDocs(collection(db,'teacherCatalog'))).docs.map(x=>({id:x.id,...x.data()}));}
async function openApp(){
 const tabs=[['assess','הערכות שלי'],['class','כיתה ודוחות'],['admin','ניהול וייבוא']].filter(x=>x[0]==='assess'||(x[0]==='class'&&['admin','homeroom','coordinator'].includes(profile.role))||(x[0]==='admin'&&profile.role==='admin'));
 if(!tabs.some(x=>x[0]===currentTab))currentTab=tabs[0][0];
 el('main').innerHTML=`<nav class="tabs">${tabs.map(([id,n])=>`<button data-tab="${id}" class="${currentTab===id?'active':''}">${n}</button>`).join('')}</nav><div id="view"></div>`;
 document.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>{currentTab=b.dataset.tab;openApp()});
 try{if(currentTab==='assess')await assessView();if(currentTab==='class')await classView();if(currentTab==='admin')await adminView();}catch(e){el('view').innerHTML=`<section class="panel error">${esc(formatError(e))}</section>`;console.error(e)}
}
async function assessView(){
 const qy=query(collection(db,'assignments'),where('teacherId','==',profile.teacherId));
 myAssignments=(await getDocs(qy)).docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>a.classId.localeCompare(b.classId,'he')||a.studentName.localeCompare(b.studentName,'he'));
 const classes=[...new Set(myAssignments.map(a=>a.classId))];
 el('view').innerHTML=`<section class="panel"><h2>הערכות מקצועיות</h2><p class="muted">כל מורה רואה רק שיבוצים שהוקצו לו. כל הערכה נשמרת באופן מרכזי.</p><div class="grid">${field('כיתה','teacherClass',`<select id="teacherClass">${opts(classes)}</select>`)}${field('תלמיד ומקצוע','teacherAssign','<select id="teacherAssign"></select>')}</div><div id="assessForm"></div></section>`;
 el('teacherClass').onchange=fillAssignments;el('teacherAssign').onchange=fillAssessment;el('teacherClass').value=classes[0]||'';await fillAssignments();
}
async function fillAssignments(){let arr=myAssignments.filter(a=>a.classId===el('teacherClass').value);el('teacherAssign').innerHTML=opts(arr.map(x=>({value:x.id,label:`${x.studentName} — ${x.subject}`})));el('teacherAssign').value=arr[0]?.id||'';await fillAssessment();}
const phrases={level:{high:'מגלה שליטה גבוהה בחומר הנלמד',good:'מגלה הבנה טובה של החומר הנלמד',progress:'מתקדם/ת ברכישת המיומנויות הנלמדות',hard:'זקוק/ה לחיזוק בסיס הידע'},participation:{active:'ומשתתף/ת באופן פעיל בשיעורים',steady:'ומגלה מעורבות בשיעורים',quiet:'ומומלץ לעודד השתתפות פעילה יותר'},strength:{effort:'בולטות התמדה והשקעה',thinking:'בולטת חשיבה עצמאית',curiosity:'ניכרים סקרנות ורצון ללמוד',team:'בולטת עבודה טובה עם אחרים'},goal:{practice:'מומלץ להמשיך לתרגל באופן עקבי',tasks:'כדאי להקפיד על הגשת מטלות',confidence:'חשוב להמשיך לחזק את הביטחון בלמידה'}};
async function fillAssessment(){
 const aid=el('teacherAssign').value; if(!aid){el('assessForm').innerHTML='<div class="empty">עדיין אין שיבוצי תלמידים עבור החשבון הזה.</div>';return}
 const a=myAssignments.find(x=>x.id===aid);
 const old=await getDoc(doc(db,'assessments',aid));
 el('assessForm').innerHTML=`<div class="notice">${esc(a.studentName)} | ${esc(a.subject)} | כיתה ${esc(a.classId)}</div><div class="grid">${Object.entries({level:'שליטה בחומר',participation:'השתתפות בשיעורים',strength:'חוזקה',goal:'המלצה להמשך'}).map(([k,label])=>field(label,k,`<select id="${k}">${Object.entries(phrases[k]).map(([v,t])=>`<option value="${v}">${esc(t)}</option>`).join('')}</select>`)).join('')}</div><div class="actions"><button class="secondary" id="compose">יצירת משפט מוצע</button></div>${field('הערכה אישית (עד 650 תווים)','assessmentText',`<textarea id="assessmentText" maxlength="650" placeholder="אפשר לערוך את המשפט או לכתוב הערכה חופשית">${esc(old.exists()?old.data().text:'')}</textarea>`)}<div class="actions"><button id="saveAssessment">שמירת ההערכה</button><span class="muted" id="countText"></span></div><div id="status"></div>`;
 const updateCount=()=>el('countText').textContent=`${el('assessmentText').value.length}/650 תווים`;
 el('assessmentText').oninput=updateCount;updateCount();
 el('compose').onclick=()=>{el('assessmentText').value=`${phrases.level[el('level').value]} ${phrases.participation[el('participation').value]}. ${phrases.strength[el('strength').value]}. ${phrases.goal[el('goal').value]}.`;updateCount()};
 el('saveAssessment').onclick=async()=>{const txt=el('assessmentText').value.trim();if(!txt)return status('יש להזין הערכה.',true);try{await setDoc(doc(db,'assessments',aid),{assignmentId:aid,studentId:a.studentId,classId:a.classId,grade:a.grade,teacherId:a.teacherId,subject:a.subject,text:txt,updatedAt:serverTimestamp(),updatedBy:user.uid});status('ההערכה נשמרה בהצלחה.')}catch(e){status(formatError(e),true)}};
}
async function availableClasses(){
 if(profile.role==='admin'){const ds=(await getDocs(collection(db,'students'))).docs;return [...new Set(ds.map(d=>d.data().classId))].sort()}
 if(profile.role==='homeroom')return profile.classes||[];
 if(profile.role==='coordinator'){let list=[];for(let g of profile.grades||[]){const ds=await getDocs(query(collection(db,'students'),where('grade','==',g)));list.push(...ds.docs.map(d=>d.data().classId))}return [...new Set(list)].sort()}
 return [];
}
async function classView(){
 const classes=await availableClasses();activeClass=classes.includes(activeClass)?activeClass:classes[0]||'';
 el('view').innerHTML=`<section class="panel"><h2>כיתה ודוחות</h2><div class="grid">${field('בחר/י כיתה','classSelect',`<select id="classSelect">${opts(classes)}</select>`)}</div><div id="classData"></div></section>`;
 el('classSelect').value=activeClass;el('classSelect').onchange=async()=>{activeClass=el('classSelect').value;await loadClass()};await loadClass();
}
async function loadClass(){
 const root=el('classData');if(!activeClass){root.innerHTML='<div class="empty">אין כיתות עם הרשאת צפייה. בקש/י הרשאה ממנהל המערכת.</div>';return}
 const ss=await getDocs(query(collection(db,'students'),where('classId','==',activeClass)));
 currentRoster=ss.docs.map(x=>({id:x.id,...x.data()})).sort((a,b)=>a.name.localeCompare(b.name,'he'));
 const aa=await getDocs(query(collection(db,'assignments'),where('classId','==',activeClass)));
 const ass=aa.docs.map(x=>({id:x.id,...x.data()}));
 const evals=await getDocs(query(collection(db,'assessments'),where('classId','==',activeClass)));
 currentAssessments=evals.docs.map(x=>({id:x.id,...x.data()}));
 const cfg=await getDoc(doc(db,'visibility',activeClass));const subjects=[...new Set(ass.map(x=>x.subject))].sort((a,b)=>a.localeCompare(b,'he'));
 const selected=cfg.exists()?cfg.data().subjects:subjects;
 const count=new Set(currentAssessments.map(x=>x.assignmentId)).size;
 root.innerHTML=`<div class="grid"><div class="stat"><strong>${currentRoster.length}</strong><small>תלמידים בכיתה</small></div><div class="stat"><strong>${ass.length}</strong><small>שיבוצים (תלמיד–מקצוע–מורה)</small></div><div class="stat"><strong>${count}</strong><small>הערכות שנשמרו</small></div></div><h3>מקצועות להצגה בדף</h3><p class="muted">הסרת מקצוע מהדוח אינה מוחקת את ההערכה של המורה.</p><div class="grid" id="subjectChoices">${subjects.map(x=>`<label class="choice"><input type="checkbox" data-subject="${esc(x)}" ${selected.includes(x)?'checked':''}>${esc(x)}</label>`).join('')}</div><div class="actions"><button id="saveSubjects">שמירת הבחירה לכיתה</button></div><h3>דוחות אישיים</h3>${field('תלמיד/ה','studentSelect',`<select id="studentSelect">${opts(currentRoster.map(x=>({value:x.id,label:x.name})))}</select>`)}<div class="actions"><button class="secondary" id="overrideBtn">בחירת מקצועות מיוחדת לתלמיד</button><button id="reportOne">תצוגת דוח לתלמיד</button><button id="reportAll">הפקת דוחות לכל הכיתה</button></div><div id="overrideSection"></div><div id="status"></div>`;
 el('saveSubjects').onclick=async()=>{const selected=[...document.querySelectorAll('[data-subject]:checked')].map(e=>e.dataset.subject);try{await setDoc(doc(db,'visibility',activeClass),{classId:activeClass,grade:gradeOf(activeClass),subjects:selected,updatedAt:serverTimestamp(),updatedBy:user.uid});status('בחירת המקצועות נשמרה.')}catch(e){status(formatError(e),true)}};
 el('overrideBtn').onclick=async()=>{const sid=el('studentSelect').value;const old=await getDoc(doc(db,'overrides',sid));const use=old.exists()?old.data().subjects:selected;el('overrideSection').innerHTML=`<div class="panel"><h3>חריגה לתלמיד/ה הנבחר/ת</h3>${subjects.map(s=>`<label class="choice"><input type="checkbox" data-override="${esc(s)}" ${use.includes(s)?'checked':''}>${esc(s)}</label>`).join('')}<div class="actions"><button id="saveOverride">שמירת חריגה</button><button class="secondary" id="clearOverride">חזרה לבחירת הכיתה</button></div></div>`;el('saveOverride').onclick=async()=>{const a=[...document.querySelectorAll('[data-override]:checked')].map(e=>e.dataset.override);await setDoc(doc(db,'overrides',sid),{studentId:sid,classId:activeClass,grade:gradeOf(activeClass),subjects:a,updatedAt:serverTimestamp(),updatedBy:user.uid});status('החריגה נשמרה.')};el('clearOverride').onclick=async()=>{await deleteDoc(doc(db,'overrides',sid));el('overrideSection').innerHTML='';status('החריגה בוטלה.')}};
 el('reportOne').onclick=async()=>await generateReports([el('studentSelect').value]);el('reportAll').onclick=async()=>await generateReports(currentRoster.map(s=>s.id));
}
async function generateReports(sids){
 try{
 const config=await getDoc(doc(db,'visibility',activeClass));const selected=config.exists()?config.data().subjects:null;
 const items=[];let oversized=[];
 for(const sid of sids){const s=currentRoster.find(x=>x.id===sid);const [over,disc,sup]=await Promise.all(['overrides','discipline','supports'].map(x=>getDoc(doc(db,x,sid))));
 const chosen=over.exists()?over.data().subjects:selected;
 const as=currentAssessments.filter(x=>x.studentId===sid && (!chosen || chosen.includes(x.subject)));
 if(as.length>16||as.some(x=>x.text.length>180))oversized.push(s.name);
 items.push({student:s,assessments:as,discipline:disc.exists()?disc.data():null,supports:sup.exists()?sup.data():null})}
 // print only in browser; nothing is persisted outside authorized Firestore documents
 renderPrint(items,oversized);
 }catch(e){status(formatError(e),true)}
}
function renderPrint(items,oversized){
 const counts=x=>{let stats=x?.counts||{};return Object.entries(stats).filter(([k])=>/הפרעה|חיסור|איחור|צל|פטפוט/.test(k)).map(([k,v])=>`${esc(k)}: <b>${number(v)}</b>`).join('  ·  ')||'לא יובאו נתוני משמעת'};
 const html=items.map(({student:s,assessments:ass,discipline:d,supports:p})=>`<section class="print-sheet report-page"><div class="report-header"><div><b>עתידים • חטיבת הביניים</b><div>דוח יום הורים | ${esc(new Date().toLocaleDateString('he-IL'))}</div></div><div>כיתה ${esc(s.classId)}</div></div><h2>תמונת תלמיד – ${esc(s.name)}</h2><h3>הערכות מורים</h3><table><thead><tr><th style="width:17%">מקצוע</th><th style="width:20%">מורה</th><th>הערכה מילולית</th></tr></thead><tbody>${ass.length?ass.map(a=>`<tr><td>${esc(a.subject)}</td><td>${esc(catalog.find(t=>t.id===a.teacherId)?.name||a.teacherId)}</td><td>${esc(a.text)}</td></tr>`).join(''):'<tr><td colspan="3">אין הערכות לפי הגדרות ההצגה</td></tr>'}</tbody></table><h3>אירועי משמעת ונוכחות</h3><div class="stats-line">${counts(d)}</div><h3>חוזקות ומענים</h3><div>${p?.items?.filter(x=>x.parentVisible && !x.sensitive).map(x=>esc(x.label)).join(' | ')||'לא הוגדרו מענים להצגה'}</div><div class="muted" style="margin-top:5mm">המידע מבוסס על הערכות המורים ועל קובצי המידע שיובאו למערכת. פערים יש לבדוק מול המחנך.</div></section>`).join('');
 el('main').innerHTML=`<div class="print-toolbar"><button id="doPrint">הדפסה / שמירה כ-PDF</button> <button class="secondary" id="backClass">חזרה לכיתה</button><span class="muted">${items.length} דוחות • עמוד אחד לכל תלמיד ביעד</span></div>${oversized.length?`<div class="warning no-print">לתשומת לב: ${oversized.length} תלמידים עם ריבוי מקצועות או הערכות ארוכות. יש לבדוק בתצוגת הדפסה שהעמוד אינו נחתך. המערכת אינה מקצרת טקסט אוטומטית: ${esc(oversized.slice(0,10).join(', '))}</div>`:''}<div class="compact">${html}</div>`;
 el('doPrint').onclick=()=>window.print();el('backClass').onclick=()=>openApp();
}
async function adminView(){
 const pending=(await getDocs(query(collection(db,'profiles'),where('status','==','pending')))).docs.map(x=>({id:x.id,...x.data()}));
 const people=(await getDocs(collection(db,'profiles'))).docs.map(x=>({id:x.id,...x.data()}));
 const options=catalog.map(x=>({value:x.id,label:x.name}));
 el('view').innerHTML=`<section class="panel"><h2>בקשות הצטרפות <span class="pill">${pending.length}</span></h2><p class="muted">אין לשייך חשבון לשם המורה ללא זיהוי עצמאי. אפשר לאשר כמה חשבונות שונים לאותו מורה.</p><div class="tablewrap"><table><thead><tr><th>שם מבוקש</th><th>חשבון Google מאומת</th><th>שיוך מורה</th><th>תפקיד והרשאות</th><th>פעולה</th></tr></thead><tbody>${pending.map(p=>`<tr><td>${esc(catalog.find(c=>c.id===p.requestedTeacherName)?.name||p.requestedTeacherName)}</td><td dir="ltr">${esc(p.email)}</td><td><select id="teacher-${p.id}">${opts(options)}</select></td><td><select id="role-${p.id}"><option value="teacher">מורה</option><option value="homeroom">מחנך</option><option value="coordinator">רכז שכבה</option><option value="admin">מנהל מערכת</option></select><input id="scope-${p.id}" placeholder="כיתות למחנך: ז5,ח2 / שכבות לרכז: ז,ח"/></td><td><button data-approve="${p.id}">אישור</button></td></tr>`).join('')||'<tr><td colspan="5">אין בקשות ממתינות</td></tr>'}</tbody></table></div><div id="approvalStatus"></div></section>
 <section class="panel"><h2>חשבונות שכבר אושרו</h2><div class="tablewrap"><table><thead><tr><th>כתובת Google</th><th>שם מורה</th><th>תפקיד</th></tr></thead><tbody>${people.filter(p=>p.status==='approved').map(p=>`<tr><td dir="ltr">${esc(p.email)}</td><td>${esc(catalog.find(c=>c.id===p.teacherId)?.name||p.teacherId)}</td><td>${esc(p.role)}</td></tr>`).join('')}</tbody></table></div></section>
 <section class="panel"><h2>ייבוא מקובצי סמארט</h2><p class="muted">הקבצים נקראים במכשיר שלך. נשלח למסד הנתונים רק מידע שתאשר לאחר תצוגה מקדימה. מומלץ להתחיל בכיתה אחת.</p><div class="grid"><div>${field('מערכות אישיות – PDF','pdfFile','<input type="file" id="pdfFile" accept=".pdf,application/pdf">')}<button class="secondary" id="parsePdf">קריאת PDF</button></div><div>${field('אירועי משמעת – Excel','xlsxFile','<input type="file" id="xlsxFile" accept=".xlsx,.xls">')}<button class="secondary" id="parseXlsx">קריאת Excel</button></div></div><div id="importView" class="notice">בחר קובץ כדי להציג נתונים לפני ייבוא. אין ייבוא אוטומטי ללא אישור.</div><div class="actions"><button id="confirmImport" disabled>אישור וייבוא נתונים שנבדקו</button></div><div id="status"></div></section>
 <section class="panel"><h2>ניהול רשימת מורים</h2><p class="muted">המערכת יוצרת שמות מורים אוטומטית בעת אישור ייבוא PDF. ניתן להוסיף שם ידנית לצורך בדיקות.</p><div class="flex"><input id="newTeacherName" placeholder="שם מורה מלא"><button id="addTeacher">הוספת מורה</button></div><p class="muted">שמות מורים במערכת: ${catalog.length}</p></section>`;
 for(let p of pending){el(`teacher-${p.id}`).value=catalog.some(x=>x.id===p.requestedTeacherName)?p.requestedTeacherName:'';}
 document.querySelectorAll('[data-approve]').forEach(b=>b.onclick=async()=>{
 const uid=b.dataset.approve;const teacherId=el(`teacher-${uid}`).value;const role=el(`role-${uid}`).value;const scopes=el(`scope-${uid}`).value.split(',').map(x=>x.trim()).filter(Boolean);
 if(!teacherId)return alert('יש לבחור מורה מרשימת המורים');if(!confirm('האם בדקת שזה אכן חשבון של המורה המבוקש?'))return;
 try{await updateDoc(doc(db,'profiles',uid),{teacherId,role,classes:role==='homeroom'?scopes:[],grades:role==='coordinator'?scopes:[],status:'approved',approvedBy:user.uid,approvedAt:serverTimestamp()});await adminView()}catch(e){el('approvalStatus').textContent=formatError(e)}
 });
 el('addTeacher').onclick=async()=>{let name=el('newTeacherName').value.trim();if(!name)return;let id=safeId(name);await setDoc(doc(db,'teacherCatalog',id),{name});await loadCatalog();await adminView()};
 el('parseXlsx').onclick=async()=>{try{status('קורא את האקסל...');staged=await parseExcel(el('xlsxFile').files[0]);stagedType='discipline';previewImport()}catch(e){status(formatError(e),true)}};
 el('parsePdf').onclick=async()=>{try{status('קורא את ה-PDF...');staged=await parsePdf(el('pdfFile').files[0]);stagedType='roster';previewImport()}catch(e){status(formatError(e),true)}};
 el('confirmImport').onclick=importConfirmed;
}
function cleanedClass(v){const s=String(v||'').replace(/[\s'׳"״]/g,'');const m=s.match(/([זחט])(\d+)/);return m?m[1]+m[2]:s}
function cleanedName(v){return String(v||'').replace(/[\s'׳"״`]/g,' ').replace(/\s+/g,' ').trim()}
function nameKey(name,cl){return safeId(cleanedClass(cl)+'_'+cleanedName(name))}
async function loadXlsx(){if(window.XLSX)return window.XLSX;await new Promise((resolve,reject)=>{const sc=document.createElement('script');sc.src='https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js';sc.onload=resolve;sc.onerror=()=>reject(new Error('לא ניתן לטעון את קורא Excel. נדרש חיבור לאינטרנט.'));document.head.appendChild(sc)});return window.XLSX}
async function parseExcel(file){if(!file)throw Error('יש לבחור קובץ Excel');const XLSX=await loadXlsx();const buf=await file.arrayBuffer();const wb=XLSX.read(buf,{type:'array'});let rows=XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]],{header:1,defval:''});
 const headerIndex=rows.findIndex(row=>row.some(v=>String(v).includes('שם התלמיד')) && row.some(v=>String(v).includes('כיתה')));
 if(headerIndex<0)throw Error('לא נמצאה שורת כותרת הכוללת שם התלמיד וכיתה.');
 const heads=rows[headerIndex].map(v=>String(v||'').split('\n')[0].replace(/^\*/,'').replace(/[`]/g,'').trim());
 const ixName=heads.findIndex(x=>x.includes('שם התלמיד')),ixClass=heads.findIndex(x=>x.includes('כיתה'));
 const out=[];for(let row of rows.slice(headerIndex+1)){const name=cleanedName(row[ixName]);const cl=cleanedClass(row[ixClass]);if(!name||!cl||name.includes('סה"כ'))continue;
 let counts={};for(let i=0;i<heads.length;i++){if(i===ixName||i===ixClass||!heads[i]||heads[i].includes('סה"כ')||heads[i]==='כיתה')continue;if(typeof row[i]==='number'||String(row[i]).trim()!=='' && !isNaN(Number(row[i])))counts[heads[i]]=number(row[i]);}
 out.push({id:nameKey(name,cl),name,classId:cl,grade:gradeOf(cl),counts});}
 if(!out.length)throw Error('לא נמצאו תלמידים בדוח המשמעת');return out;
}
const SUBJECTS=['אסטרטגיות במתמטיקה','אסטרטגיות למידה','מדעי כדור הארץ','חינוך לבריאות','קמפוס עתידטק','קמפוס כדורגל','צילום וקולנוע','שבילי מורשת','כישורי חיים','מתמטיקה','אנגלית','עברית','מדעים','ספרות','היסטוריה','גאוגרפיה','אזרחות','ערבית','תנך','תנ``ך','חנ``ג','חנג','חינוך','שילוב','קשת','פרטני','תגבור','ממריאות','CBT'];
const SUPPORTS=['שילוב','קשת','פרטני','תגבור','ממריאות','CBT','אסטרטגיות למידה'];
function parseTimetableText(txt){
 const lines=txt.split(/\n/).map(x=>x.trim()).filter(Boolean);
 const first=lines.find(x=>x.includes('מערכת שעות לתלמיד'))||'';
 // Smart timetable PDFs often extract RTL punctuation in visual order:
 // e.g. "(5 'מערכת שעות לתלמיד/ה: NAME )ז" instead of "NAME (ז' 5)".
 const flat=first.replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g,'').replace(/\s+/g,' ').trim();
 const title=flat.match(/מערכת\s*שעות\s*לתלמיד\s*\/\s*ה\s*:?\s*(.*)/);
 if(!title)return {error:'כותרת מערכת אישית לא נמצאה',first};
 const after=title[1];
 const gradeAfter=after.match(/[()\s]*([זחט])\s*['׳״"()\s]*(\d{1,2})/);
 const gradeLetterAtEnd=after.match(/[()\s]*([זחט])\s*[()\s]*$/);
 const gradeBefore=flat.split('מערכת')[0].match(/(?:^|[('׳"\s])(\d{1,2})\s*['׳"()\s]*$/);
 const gradeDigitAtEnd=after.match(/[()\s]*(\d{1,2})\s*['׳״"()\s]*$/);
 const grade=gradeAfter?.[1]||gradeLetterAtEnd?.[1];
 const number=gradeAfter?.[2]||gradeDigitAtEnd?.[1]||gradeBefore?.[1];
 const namePart=after.replace(/\s*[()]\s*[זחט]\s*['׳״"()\s]*\d{0,2}\s*[()]*$/,'').replace(/\s+[זחט]\s*['׳״"()\s]*\d{1,2}\s*[()]*$/,'');
 const name=cleanedName(namePart),cl=grade&&number?grade+number:'';
 if(!name||!cl)return {error:'כותרת תלמיד זוהתה אך שם/כיתה לא פוענחו',first};
 const entries=[],supports=[];
 for(let i=0;i<lines.length;i++){
  const raw=lines[i];const subject=SUBJECTS.find(s=>raw===s||raw.startsWith(s+' ')||raw.startsWith(s+'('));if(!subject)continue;
  const subj=subjectNormalize(subject).replace('תנ``ך','תנ״ך');
  let teacher='';for(let j=i+1;j<Math.min(lines.length,i+6);j++){
   const v=lines[j];if(/^(?:חדר|[0-9]|קבוצה|הטרוגנית|\(|\)|שעה|\d\d:\d\d)/.test(v))continue;
   if(SUBJECTS.some(s=>v.startsWith(s)))break;
   if(/^[\p{L}][\p{L}\s'׳"״-]{3,}$/u.test(v)){teacher=cleanedName(v);break;}
  }
  if(SUPPORTS.includes(subj)){supports.push({label:subj,sensitive:/CBT|פרטני/.test(subj),parentVisible:!(/CBT|פרטני/.test(subj))});continue}
  if(teacher && !entries.some(e=>e.subject===subj&&e.teacher===teacher))entries.push({subject:subj,teacher});
 }
 return {id:nameKey(name,cl),name,classId:cl,grade:gradeOf(cl),entries,supports:[...new Map(supports.map(x=>[x.label,x])).values()]};
}
async function parsePdf(file){if(!file)throw Error('יש לבחור קובץ PDF');const pdfjs=await import('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.min.mjs');pdfjs.GlobalWorkerOptions.workerSrc='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.worker.min.mjs';
 const pdf=await pdfjs.getDocument({data:new Uint8Array(await file.arrayBuffer())}).promise;
 const out=[];for(let n=1;n<=pdf.numPages;n++){const page=await pdf.getPage(n);const c=await page.getTextContent();const lines=[];let lastY=null,line=[];
 // PDF.js exports individual text chunks; group by approximate Y position, reading in original stream order.
 for(const item of c.items){let y=Math.round(item.transform?.[5]||0);if(lastY!==null&&Math.abs(y-lastY)>2&&line.length){lines.push(line.join(' '));line=[]}line.push(item.str);lastY=y}if(line.length)lines.push(line.join(' '));
 let result=parseTimetableText(lines.join('\n'));
 if(result.error){result=parseTimetableText(c.items.map(i=>i.str).join('\n'))}
 out.push({...result,page:n});}
 if(!out.some(x=>x.id)){const example=out[0]?.first||'ללא כותרת';throw Error('לא זוהו שמות וכיתות מתוך ה-PDF. דוגמת כותרת: '+example.slice(0,120));}return out;
}
function previewImport(){const host=el('importView');let valid=staged.filter(x=>x.id&&!x.error);el('confirmImport').disabled=!valid.length;
 if(stagedType==='discipline'){
 host.innerHTML=`<b>נמצאו ${valid.length} רשומות משמעת</b><div class="tablewrap"><table><thead><tr><th>תלמיד</th><th>כיתה</th><th>מספר סוגי אירועים</th></tr></thead><tbody>${valid.slice(0,15).map(x=>`<tr><td>${esc(x.name)}</td><td>${esc(x.classId)}</td><td>${Object.keys(x.counts).length}</td></tr>`).join('')}</tbody></table></div><small>בדוק/י שמות וכיתות לפני אישור. הצגה של 15 הראשונים.</small>`;
 } else {
 let count=valid.reduce((n,x)=>n+x.entries.length,0);
 host.innerHTML=`<b>${valid.length} תלמידים, ${count} שיבוצים מזוהים</b><div class="warning">זיהוי המקצועות והמורים מתוך PDF הוא ניסיוני. יש לבדוק את התאמת המורה לכל מקצוע ולתקן טעויות לפני אישור. רשומה ללא מורה לא תהפוך לשיבוץ.</div><div class="tablewrap"><table><thead><tr><th>עמוד</th><th>תלמיד</th><th>כיתה</th><th>מקצועות ומורים שזוהו</th></tr></thead><tbody>${staged.slice(0,25).map(x=>`<tr><td>${x.page}</td><td>${esc(x.name||x.first||'זיהוי נכשל')}</td><td>${esc(x.classId||'')}</td><td>${(x.entries||[]).map(e=>`${esc(e.subject)} – ${esc(e.teacher)}`).join(' | ')}</td></tr>`).join('')}</tbody></table></div><small>מוצגות 25 רשומות ראשונות. יש לבדוק מדגם מכל הקבוצות ולוודא התאמה למקור לפני ייבוא.</small>`;
 }
 status('הקובץ נקרא; הייבוא לא בוצע עדיין.');
}
async function commitChunks(operations){for(let i=0;i<operations.length;i+=350){const batch=writeBatch(db);for(let op of operations.slice(i,i+350)){batch.set(doc(db,op.col,op.id),op.data,{merge:op.merge??false})}await batch.commit();}}
async function importConfirmed(){if(!staged.length)return;
 if(!confirm(`לייבא ${staged.length} רשומות? הפעולה תעדכן מידע קיים עם אותם מזהים. יש לוודא שהנתונים מדויקים.`))return;
 el('confirmImport').disabled=true;
 try{
  if(stagedType==='discipline'){
   const valid=staged.filter(x=>x.id);const operations=valid.map(x=>({col:'discipline',id:x.id,data:{classId:x.classId,grade:x.grade,counts:x.counts,updatedAt:serverTimestamp()}}));await commitChunks(operations);
   status(`יובאו ${valid.length} רשומות משמעת. כדי שיתחברו לדף התלמיד, עליו להיות קיים עם אותו שם וכיתה.`);
  }else{
   const valid=staged.filter(x=>x.id);let ops=[];let teacherMap=new Map(catalog.map(x=>[x.name,x.id]));
   for(const x of valid){let tids=[];for(const e of x.entries){let tid=teacherMap.get(e.teacher)||safeId(e.teacher);teacherMap.set(e.teacher,tid);tids.push(tid);ops.push({col:'teacherCatalog',id:tid,data:{name:e.teacher}});const aid=safeId(x.id+'__'+e.subject+'__'+tid);ops.push({col:'assignments',id:aid,data:{studentId:x.id,studentName:x.name,classId:x.classId,grade:x.grade,teacherId:tid,subject:e.subject}})}
    ops.push({col:'students',id:x.id,data:{name:x.name,classId:x.classId,grade:x.grade,teacherIds:[...new Set(tids)]}});
    if(x.supports.length)ops.push({col:'supports',id:x.id,data:{classId:x.classId,grade:x.grade,items:x.supports}});
   }
   const unique=[...new Map(ops.map(o=>[o.col+'/'+o.id,o])).values()];await commitChunks(unique);await loadCatalog();status(`יובאו ${valid.length} תלמידים ו-${unique.filter(o=>o.col==='assignments').length} שיבוצים. יש לבדוק את הנתונים לפני אישור חשבונות מורים.`);
  }
 }catch(e){status('הייבוא לא הושלם: '+formatError(e),true)}finally{el('confirmImport').disabled=false}
}
el('startBtn')?.addEventListener('click',()=>{location.hash='setup';location.reload()});
boot().catch(e=>hero('שגיאה בטעינת המערכת',esc(formatError(e))));
