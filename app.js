(async function initializeSealSystem(){

const cacheName =
localStorage.getItem(
"userName"
);

const cacheEmail =
localStorage.getItem(
"userEmail"
);

if(cacheName && cacheEmail){

const nameEl =
document.getElementById(
"sidebarUserName"
);

const emailEl =
document.getElementById(
"sidebarUserEmail"
);

if(nameEl)
nameEl.textContent = cacheName;

if(emailEl)
emailEl.textContent = cacheEmail;


}

const { initializeApp } =
await import(
"https://www.gstatic.com/firebasejs/12.13.0/firebase-app.js"
);

const {
getFirestore,
collection,
addDoc,
getDocs,
getDoc,
updateDoc,
deleteDoc,
doc,
query,
where
} = await import(
"https://www.gstatic.com/firebasejs/12.13.0/firebase-firestore.js"
);

const {
getAuth,
GoogleAuthProvider,
signInWithPopup,
signOut,
onAuthStateChanged
} = await import(
"https://www.gstatic.com/firebasejs/12.13.0/firebase-auth.js"
);

const firebaseConfig = {

apiKey: "AIzaSyCzvPwTbxc_Lg7peKRgP0zUrlmI6kkE0b4",
authDomain: "seal-management-68465.firebaseapp.com",
projectId: "seal-management-68465",
storageBucket: "seal-management-68465.firebasestorage.app",
messagingSenderId: "933578260928",
appId: "1:933578260928:web:4c5f41252fd786e1bf0825",
measurementId: "G-7RKPNF7BK9"

};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const auth = getAuth(app);
const provider = new GoogleAuthProvider();

let currentRole = "";

function normalizeRole(role){
return String(role || "").trim().toLowerCase();
}

function isAdminRole(){
return normalizeRole(currentRole) === "admin";
}

function isViewerRole(){
return normalizeRole(currentRole) === "viewer";
}

function blockViewerAction(){

if(!isViewerRole()) return false;

alert("Viewer 僅能瀏覽待借用管理與借用紀錄");
return true;

}

function applyRoleAccess(){

const isViewer = isViewerRole();

document.body.classList.toggle(
"viewer-mode",
isViewer
);

document
.querySelectorAll(".menu-item")
.forEach(item=>{
item.style.display = "";
});

const exportButton =
document.querySelector('[onclick="exportExcel()"]');

const addPendingButton =
document.getElementById("addPendingButton");

const systemMenuTitle =
document.getElementById("systemMenuTitle");

if(exportButton){
exportButton.style.display = "";
}

if(addPendingButton){
addPendingButton.style.display = "";
}

if(systemMenuTitle){
systemMenuTitle.style.display = "";
}

if(!isViewer) return;

document
.querySelectorAll(".menu-item")
.forEach(item=>{
const action =
item.getAttribute("onclick") || "";

item.style.display =
action.includes("pendingPage") ||
action.includes("historyPage")
? ""
: "none";
});

if(exportButton){
exportButton.style.display = "none";
}

if(addPendingButton){
addPendingButton.style.display = "none";
}

if(systemMenuTitle){
systemMenuTitle.style.display = "none";
}

document
.querySelectorAll(
".record-action-column,.pending-action-column"
)
.forEach(el=>el.style.display = "none");

}
let currentUserEmail = "";

let currentUser = "系統使用者";
let isAdmin = true;

let records = [];
let sealList = [];
let departmentList = [];
let pendingRecords = [];
let userList = [];
let currentPendingIndex = null;
let pendingTransferDraft = null;
let borrowEntryDraft = null;
let selectedBorrowSeal = "";
let selectedBorrowRecordId = null;
let borrowPanelMode = "new";
let editingPendingId = null;

let loginLogs = [];

let loginCurrentPage = 1;
let loginPageSize = 10;

let auditLogs = [];
let auditCurrentPage = 1;
let auditPageSize = 25;

const auditActionLabels = {
borrow:"借用",
return:"歸還",
update:"修改",
delete:"刪除",
create:"新增",
permission:"權限異動"
};

const auditCategoryLabels = {
sealRecord:"借用紀錄",
pendingRecord:"待借用案件",
seal:"印鑑",
department:"部門",
user:"使用者權限"
};

function compactAuditData(data){

if(!data) return null;

const result = {};

Object.entries(data).forEach(([key,value])=>{

if(key === "id") return;

if(
value === null ||
["string","number","boolean"].includes(typeof value)
){
result[key] = value;
}

});

return result;

}

async function writeAuditLog({
action,
category,
targetId = "",
targetLabel = "",
before = null,
after = null
}){

try{

await addDoc(
collection(db,"auditLogs"),
{
actorName:currentUser || "系統使用者",
actorEmail:currentUserEmail || "",
actorRole:currentRole || "",
action,
category,
targetId,
targetLabel,
before:compactAuditData(before),
after:compactAuditData(after),
createdAt:new Date()
}
);

}catch(error){

console.error("操作紀錄寫入失敗",error);

}

}

function escapeAuditText(value){

return String(value ?? "")
.replaceAll("&","&amp;")
.replaceAll("<","&lt;")
.replaceAll(">","&gt;")
.replaceAll('"',"&quot;")
.replaceAll("'","&#039;");

}

function getAuditSummary(log){

const source =
log.after || log.before || {};

const labels = {
seal:"印鑑",
borrower:"借用人",
department:"部門",
projectNo:"計畫編號",
formNo:"表單編號",
purpose:"用途",
email:"Email",
departmentName:"部門名稱",
employeeName:"員工姓名",
role:"角色",
enabled:"啟用狀態",
status:"狀態",
name:"名稱",
sortOrder:"排序",
returnTime:"歸還時間"
};

const categoryFieldOrders = {
sealRecord:[
"seal",
"borrower",
"department",
"projectNo",
"formNo",
"purpose",
"status",
"returnTime"
],
pendingRecord:[
"borrower",
"department",
"projectNo",
"formNo",
"purpose",
"status"
],
user:[
"email",
"departmentName",
"employeeName",
"role",
"enabled",
"name"
],
seal:[
"name",
"sortOrder",
"status"
],
department:[
"name",
"sortOrder",
"status"
]
};

const fallbackOrder = [
"seal",
"borrower",
"department",
"projectNo",
"formNo",
"purpose",
"email",
"departmentName",
"employeeName",
"role",
"enabled",
"status",
"name",
"sortOrder",
"returnTime"
];

const primaryOrder =
categoryFieldOrders[log.category] || fallbackOrder;

const extraKeys =
Object.keys(source)
.filter(key=>labels[key] && !primaryOrder.includes(key))
.sort((a,b)=>labels[a].localeCompare(labels[b],"zh-Hant"));

const orderedKeys = [
...primaryOrder,
...extraKeys
];

const parts = orderedKeys
.filter(key => Object.prototype.hasOwnProperty.call(source,key))
.map(key=>{

const value = source[key];

return `${labels[key]}：${
value === true ? "是" :
value === false ? "否" :
value ?? "-"
}`;

});

return parts.join("；") || "-";

}

async function loadAuditLogs(){

const table =
document.getElementById("auditLogTable");

if(!isAdminRole()){

if(table){
table.innerHTML = `
<tr>
<td colspan="7">
目前角色無法讀取操作紀錄（角色：${escapeAuditText(currentRole || "未設定")}）
</td>
</tr>
`;
}

return;

}

if(table){
table.innerHTML = `
<tr>
<td colspan="7">操作紀錄載入中...</td>
</tr>
`;
}

try{

const snapshot =
await getDocs(collection(db,"auditLogs"));

auditLogs = [];

snapshot.forEach(docSnap=>{
auditLogs.push({
id:docSnap.id,
...docSnap.data()
});
});

auditLogs.sort((a,b)=>{

const timeDiff =
getRecordTime(b.createdAt) -
getRecordTime(a.createdAt);

if(timeDiff !== 0) return timeDiff;

return String(b.id || "").localeCompare(String(a.id || ""));

});

renderAuditLogs();

}catch(error){

console.error("讀取操作紀錄失敗",error);

if(table){
table.innerHTML = `
<tr>
<td colspan="7">
操作紀錄讀取失敗：${escapeAuditText(error.message || "未知錯誤")}
</td>
</tr>
`;
}

}

}

async function openAuditLogPage(el){

if(!isAdminRole()){
alert(
`目前帳號角色為「${currentRole || "未設定"}」，只有 Admin 可以查看操作紀錄`
);
return;
}

showPage("auditLogPage",el);
await loadAuditLogs();

}

function getFilteredAuditLogs(){

const keyword =
(document.getElementById("auditSearch")?.value || "")
.trim()
.toLowerCase();

const action =
document.getElementById("auditActionFilter")?.value || "";

const startDate =
document.getElementById("auditDateStart")?.value || "";

const endDate =
document.getElementById("auditDateEnd")?.value || "";

return auditLogs.filter(log=>{

const keywordMatch =
!keyword ||
[
log.actorName,
log.actorEmail,
log.targetLabel,
getAuditSummary(log)
]
.some(value=>
String(value || "").toLowerCase().includes(keyword)
);

const actionMatch =
!action || log.action === action;

const dateMatch =
matchesDateRange(
log.createdAt,
startDate,
endDate
);

return keywordMatch && actionMatch && dateMatch;

});

}

function renderAuditLogs(){

const table =
document.getElementById("auditLogTable");

if(!table) return;

const filtered = getFilteredAuditLogs();

document.getElementById("auditCount").textContent =
`(${filtered.length}筆)`;

const totalPages =
Math.ceil(filtered.length / auditPageSize);

if(auditCurrentPage > totalPages){
auditCurrentPage = 1;
}

const start =
(auditCurrentPage - 1) * auditPageSize;

const pageRows =
filtered.slice(start,start + auditPageSize);

if(pageRows.length === 0){

table.innerHTML = `
<tr>
<td colspan="7">目前沒有符合條件的操作紀錄</td>
</tr>
`;

renderAuditPagination(totalPages);
return;

}

table.innerHTML =
pageRows.map(log=>`
<tr>
<td>${escapeAuditText(formatDate(log.createdAt))}</td>
<td>
${escapeAuditText(log.actorName || "-")}
<div style="font-size:11px;color:#94a3b8;margin-top:4px;">
${escapeAuditText(log.actorEmail || "")}
</div>
</td>
<td>${escapeAuditText(log.actorRole || "-")}</td>
<td>
<span class="badge badge-blue">
${escapeAuditText(auditActionLabels[log.action] || log.action || "-")}
</span>
</td>
<td>${escapeAuditText(auditCategoryLabels[log.category] || log.category || "-")}</td>
<td>${escapeAuditText(log.targetLabel || log.targetId || "-")}</td>
<td class="audit-detail">${escapeAuditText(getAuditSummary(log))}</td>
</tr>
`).join("");

renderAuditPagination(totalPages);

}

function renderAuditPagination(totalPages){

const area =
document.getElementById("auditPagination");

if(!area) return;

area.innerHTML = "";

for(let page=1;page<=totalPages;page++){

const button =
document.createElement("button");

button.className = "btn";
button.textContent = page;
button.style.background =
page === auditCurrentPage ? "#2563eb" : "#e2e8f0";
button.style.color =
page === auditCurrentPage ? "white" : "#0f172a";

button.onclick = ()=>{
auditCurrentPage = page;
renderAuditLogs();
};

area.appendChild(button);

}

}

function changeAuditPageSize(){

auditPageSize =
parseInt(
document.getElementById("auditPageSize").value
);

auditCurrentPage = 1;
renderAuditLogs();

}

function resetAuditFilter(){

document.getElementById("auditSearch").value = "";
document.getElementById("auditActionFilter").value = "";
document.getElementById("auditDateStart").value = "";
document.getElementById("auditDateEnd").value = "";

auditCurrentPage = 1;
renderAuditLogs();

}

async function loadLoginLogs(){

const snapshot =
await getDocs(
collection(db,"loginLogs")
);

loginLogs = [];

snapshot.forEach(docSnap=>{

loginLogs.push(
docSnap.data()
);

});

renderLoginLogs();

}

function renderLoginLogs(){

const table =
document.getElementById(
"loginLogTable"
);

if(!table) return;

table.innerHTML = "";

const sortedLogs =
[...loginLogs]
.sort((a,b)=>
getRecordTime(b.loginTime) - getRecordTime(a.loginTime)
);

document.getElementById(
"loginCount"
).innerText =
`(${sortedLogs.length}筆)`;

const totalPages =
Math.ceil(
sortedLogs.length /
loginPageSize
);

const start =
(loginCurrentPage - 1)
* loginPageSize;

const pageLogs =
sortedLogs.slice(
start,
start + loginPageSize
);

pageLogs.forEach(log=>{

table.innerHTML += `

<tr>

<td>${formatDate(log.loginTime)}</td>

<td>${log.name}</td>

<td>${log.email}</td>

<td>${log.role}</td>

</tr>

`;

});

renderLoginPagination(
totalPages
);

}

function changeLoginPageSize(){

loginPageSize =
parseInt(
document.getElementById(
"loginPageSize"
).value
);

loginCurrentPage = 1;

renderLoginLogs();

}

window.changeLoginPageSize =
changeLoginPageSize;

function renderLoginPagination(
totalPages
){

const area =
document.getElementById(
"loginPagination"
);

if(!area) return;

area.innerHTML = "";

if(totalPages <= 1) return;

for(
let i=1;
i<=totalPages;
i++
){

const btn =
document.createElement(
"button"
);

btn.className = "btn";

btn.innerText = i;

btn.style.marginLeft = "5px";

btn.onclick = ()=>{

loginCurrentPage = i;

renderLoginLogs();

};

area.appendChild(btn);

}

}

async function loadUsers(){

const snapshot =
await getDocs(
collection(db,"users")
);

userList = [];

snapshot.forEach(docSnap=>{

userList.push({

id:docSnap.id,
...docSnap.data()

});

});

renderUserList();

}
async function loadPendingRecords(){

const querySnapshot =
await getDocs(collection(db,"pendingRecords"));

pendingRecords = [];

querySnapshot.forEach((docSnap)=>{

pendingRecords.push({

id:docSnap.id,
...docSnap.data()

});

});

renderPendingTable();

}

let currentPage = 1;
let pageSize = 10;

function showPage(pageId,el){

const adminPages = [
"permissionPage",
"loginLogPage",
"auditLogPage"
];

if(
!isAdminRole() &&
adminPages.includes(pageId)
){
pageId = "borrowPage";
el = document.querySelector(
'[onclick*="borrowPage"]'
);
}

if(
isViewerRole() &&
pageId !== "pendingPage" &&
pageId !== "historyPage"
){
pageId = "historyPage";
el = document.querySelector('[onclick*="historyPage"]');
}

const targetPage =
document.getElementById(pageId);

if(!targetPage || !el){

pageId = "borrowPage";
el = document.querySelector(
'[onclick*="borrowPage"]'
);

}

document
.querySelectorAll(
"#borrowPage,#pendingPage,#returnPage,#historyPage,#sealPage,#deptPage,#permissionPage,#loginLogPage,#auditLogPage"
)
.forEach(page=>page.classList.add("hidden"));

document
.getElementById(pageId)
.classList.remove("hidden");

document
.querySelectorAll(".menu-item")
.forEach(item=>item.classList.remove("active"));

el.classList.add("active");

localStorage.setItem(
    "lastPage",
    pageId
);

}

window.showPage = showPage;
window.loadAuditLogs = loadAuditLogs;
window.openAuditLogPage = openAuditLogPage;
window.changeAuditPageSize = changeAuditPageSize;
window.resetAuditFilter = resetAuditFilter;

function restoreLastPage(){

    if(isViewerRole()){

        const viewerPage =
        localStorage.getItem("lastPage") === "pendingPage"
        ? "pendingPage"
        : "historyPage";

        const viewerMenu =
        document.querySelector(
            `[onclick*="${viewerPage}"]`
        );

        showPage(
            viewerPage,
            viewerMenu
        );

        return;

    }

    const lastPage =
    localStorage.getItem(
        "lastPage"
    );

    if(!lastPage){

    showPage(
        "borrowPage",
        document.querySelector(".menu-item")
    );

    return;

}

    const targetMenu =
    lastPage === "auditLogPage"
    ? document.getElementById("auditLogMenu")
    : document.querySelector(
        `[onclick*="${lastPage}"]`
    );

    if(targetMenu){

        showPage(
            lastPage,
            targetMenu
        );

        if(
        lastPage === "auditLogPage" &&
        isAdminRole()
        ){
        loadAuditLogs();
        }

        return;

    }

    localStorage.removeItem("lastPage");

    showPage(
        "borrowPage",
        document.querySelector(
            '[onclick*="borrowPage"]'
        )
    );

}

function toggleAdvancedFilter(){

const panel =
document.getElementById("advancedFilter");

const text =
document.getElementById("filterToggleText");

panel.classList.toggle("show");

if(panel.classList.contains("show")){

text.innerHTML = "收合篩選";

}else{

text.innerHTML = "進階篩選";

}

}

window.toggleAdvancedFilter =
toggleAdvancedFilter;

function resetHistoryFilter(){

document.getElementById("searchInput").value = "";
document.getElementById("sealFilter").value = "";
document.getElementById("statusFilter").value = "";

document.getElementById("projectFilter").value = "";
document.getElementById("formFilter").value = "";

document.getElementById("borrowDateStart").value = "";
document.getElementById("borrowDateEnd").value = "";
document.getElementById("returnDateStart").value = "";
document.getElementById("returnDateEnd").value = "";

currentPage = 1;

renderTable();

}

window.resetHistoryFilter =
resetHistoryFilter;

async function deletePending(id){

if(blockViewerAction()) return;

const pendingItem =
pendingRecords.find(item=>item.id===id);

if(!confirm("確定刪除？"))
return;

await deleteDoc(
doc(
db,
"pendingRecords",
id
)
);

await writeAuditLog({
action:"delete",
category:"pendingRecord",
targetId:id,
targetLabel:pendingItem?.formNo || pendingItem?.borrower || id,
before:pendingItem
});

await loadPendingRecords();

}

window.deletePending = deletePending;

function openPendingModal(){

if(blockViewerAction()) return;

const deptSelect =
document.getElementById("pendingDepartment");

deptSelect.innerHTML =
'<option value="">請選擇</option>';

departmentList.forEach(dept=>{

deptSelect.innerHTML += `
<option value="${dept.name}">
${dept.name}
</option>
`;

});

document.getElementById("pendingBorrower").value = "";
document.getElementById("pendingDepartment").value = "";
document.getElementById("pendingProjectNo").value = "";
document.getElementById("pendingFormNo").value = "";
document.getElementById("pendingPurpose").value = "";
editingPendingId = null;

document.querySelector(
"#pendingOverlay h2"
).innerHTML = `

<i
data-lucide="clock-3"
class="detail-title-icon">
</i>

新增待借用案件

`;

lucide.createIcons();

document.getElementById("pendingOverlay").style.display =
"flex";

}

function closePendingModal(){

document.getElementById("pendingOverlay").style.display =
"none";

}

window.openPendingModal = openPendingModal;
window.closePendingModal = closePendingModal;

async function savePendingRecord(){

if(blockViewerAction()) return;

const borrower =
document.getElementById("pendingBorrower")
.value.trim();

const department =
document.getElementById("pendingDepartment")
.value;

const projectNo =
document.getElementById("pendingProjectNo")
.value.trim();

const formNo =
document.getElementById("pendingFormNo")
.value.trim();

const purpose =
document.getElementById("pendingPurpose")
.value.trim();

if(
!borrower ||
!department ||
!projectNo ||
!formNo ||
!purpose
){

alert("請完整填寫資料");
return;

}

if(editingPendingId){

const before =
pendingRecords.find(
item=>item.id===editingPendingId
);

await updateDoc(
doc(
db,
"pendingRecords",
editingPendingId
),
{

borrower,
department,
projectNo,
formNo,
purpose

}
);

await writeAuditLog({
action:"update",
category:"pendingRecord",
targetId:editingPendingId,
targetLabel:formNo || borrower,
before,
after:{
borrower,
department,
projectNo,
formNo,
purpose,
status:before?.status || "待借用"
}
});

}else{

const newPendingRef =
await addDoc(
collection(db,"pendingRecords"),
{

borrower,
department,
projectNo,
formNo,
purpose,
status:"待借用",
createTime:new Date()

}
);

await writeAuditLog({
action:"create",
category:"pendingRecord",
targetId:newPendingRef.id,
targetLabel:formNo || borrower,
after:{
borrower,
department,
projectNo,
formNo,
purpose,
status:"待借用"
}
});

}

closePendingModal();

await loadPendingRecords();

alert("新增成功");

}

window.savePendingRecord =
savePendingRecord;

async function addWhitelistUser(){

if(blockViewerAction()) return;

const email =
document.getElementById(
"newUserEmail"
).value.trim();

const departmentName =
(document.getElementById("newUserDepartment")?.value || "")
.trim();

const employeeName =
(document.getElementById("newUserName")?.value || "")
.trim();

if(!email){

alert("請輸入Email");
return;

}

const newUserData = {
email,
departmentName,
employeeName,
role:"user",
enabled:true
};

const newUserRef =
await addDoc(
collection(db,"users"),
newUserData
);

await writeAuditLog({
action:"permission",
category:"user",
targetId:newUserRef.id,
targetLabel:email,
after:newUserData
});

document.getElementById(
"newUserEmail"
).value = "";

if(document.getElementById("newUserDepartment")){
document.getElementById("newUserDepartment").value = "";
}

if(document.getElementById("newUserName")){
document.getElementById("newUserName").value = "";
}

alert("新增成功");

loadUsers();

}

window.addWhitelistUser =
addWhitelistUser;

async function deleteUser(id){

if(blockViewerAction()) return;

const user =
userList.find(u=>u.id===id);

if(user?.role === "admin"){

alert("管理員不可刪除");
return;

}

if(!confirm("確定刪除？"))
return;

await deleteDoc(
doc(db,"users",id)
);

await writeAuditLog({
action:"permission",
category:"user",
targetId:id,
targetLabel:user?.email || id,
before:user,
after:{deleted:true}
});

loadUsers();

}

window.deleteUser =
deleteUser;

async function toggleUser(
id,
enabled
){

if(blockViewerAction()) return;

const user =
userList.find(item=>item.id===id);

await updateDoc(
doc(db,"users",id),
{
enabled:!enabled
}
);

await writeAuditLog({
action:"permission",
category:"user",
targetId:id,
targetLabel:user?.email || id,
before:user,
after:{
...user,
enabled:!enabled
}
});

loadUsers();

}

window.toggleUser =
toggleUser;

async function changeRole(
id,
role
){

if(blockViewerAction()) return;

const user =
userList.find(item=>item.id===id);

await updateDoc(
doc(db,"users",id),
{
role
}
);

await writeAuditLog({
action:"permission",
category:"user",
targetId:id,
targetLabel:user?.email || id,
before:user,
after:{
...user,
role
}
});

loadUsers();

}

window.changeRole =
changeRole;

async function editPending(id){

if(blockViewerAction()) return;

const item =
pendingRecords.find(
x => x.id === id
);

const deptSelect =
document.getElementById(
"pendingDepartment"
);

deptSelect.innerHTML =
'<option value="">請選擇</option>';

departmentList.forEach(dept=>{

deptSelect.innerHTML += `
<option value="${dept.name}">
${dept.name}
</option>
`;

});

editingPendingId = item.id;

document.getElementById("pendingBorrower").value =
item.borrower || "";

document.getElementById("pendingDepartment").value =
item.department || "";

document.getElementById("pendingProjectNo").value =
item.projectNo || "";

document.getElementById("pendingFormNo").value =
item.formNo || "";

document.getElementById("pendingPurpose").value =
item.purpose || "";

document.querySelector(
"#pendingOverlay h2"
).innerHTML = `

<i
data-lucide="pencil"
class="detail-title-icon">
</i>

編輯待借用案件

`;

lucide.createIcons();

document.getElementById("pendingOverlay").style.display =
"flex";

}

window.editPending = editPending;

function convertPending(id){

if(blockViewerAction()) return;

const item =
pendingRecords.find(
x => x.id === id
);

currentPendingIndex = id;

pendingTransferDraft = {
borrower:item.borrower || "",
department:item.department || "",
projectNo:item.projectNo || "",
formNo:item.formNo || "",
purpose:item.purpose || ""
};

selectedBorrowSeal = "";
selectedBorrowRecordId = null;
borrowPanelMode = "new";

const borrowMenu =
document.querySelectorAll(".menu-item")[0];

showPage(
"borrowPage",
borrowMenu
);

showPendingTransferDraft();
renderStatus();

}

window.convertPending = convertPending;

function getUserDisplayName(user){

const departmentName = String(user?.departmentName || "").trim();
const employeeName = String(user?.employeeName || user?.name || "").trim();

return [departmentName,employeeName]
.filter(Boolean)
.join(" ") || user?.email || "使用者";

}

function escapeHtml(value){

return String(value ?? "")
.replaceAll("&","&amp;")
.replaceAll("<","&lt;")
.replaceAll(">","&gt;")
.replaceAll('"',"&quot;")
.replaceAll("'","&#039;");

}

async function updateUserProfile(id){

if(blockViewerAction()) return;

const user =
userList.find(item=>item.id===id);

const departmentName =
(document.getElementById(`userDepartment_${id}`)?.value || "")
.trim();

const employeeName =
(document.getElementById(`userName_${id}`)?.value || "")
.trim();

await updateDoc(
doc(db,"users",id),
{
departmentName,
employeeName
}
);

await writeAuditLog({
action:"permission",
category:"user",
targetId:id,
targetLabel:user?.email || id,
before:user,
after:{
...user,
departmentName,
employeeName
}
});

alert("使用者資料已更新");
loadUsers();

}

window.updateUserProfile = updateUserProfile;

function renderUserList(){

const area =
document.getElementById(
"userListArea"
);

if(!area) return;

area.innerHTML = "";

userList.forEach(user=>{

const email = escapeHtml(user.email || "");
const departmentName = escapeHtml(user.departmentName || "");
const employeeName = escapeHtml(user.employeeName || user.name || "");
const displayName = escapeHtml(getUserDisplayName(user));

area.innerHTML += `

<div class="maintenance-item user-maintenance-item">

<div class="user-maintenance-main">

<div class="user-identity-row">
<strong>${displayName}</strong>
<span class="user-email-text">${email}</span>
</div>

<div class="user-profile-grid">

<label class="user-profile-field">
<span>部門名稱</span>
<input
    type="text"
    id="userDepartment_${user.id}"
    value="${departmentName}"
    placeholder="例如：行政部">
</label>

<label class="user-profile-field">
<span>員工姓名</span>
<input
    type="text"
    id="userName_${user.id}"
    value="${employeeName}"
    placeholder="例如：蔡雨鑫">
</label>

<div class="user-profile-field">
<span>角色</span>
<select onchange="changeRole('${user.id}',this.value)">

<option value="admin"
${user.role==="admin"?"selected":""}>
Admin
</option>

<option value="user"
${user.role==="user"?"selected":""}>
User
</option>

<option value="viewer"
${user.role==="viewer"?"selected":""}>
Viewer
</option>

</select>
</div>

<div class="user-profile-status">
${user.enabled

? '<span class="badge badge-green">啟用</span>'

: '<span class="badge badge-red">停用</span>'

}
</div>

</div>

</div>

<div class="user-maintenance-actions">

<button
class="btn btn-gray"
onclick="updateUserProfile('${user.id}')">
儲存資料
</button>

<button
class="btn btn-gray"
onclick="toggleUser('${user.id}',${user.enabled})">

${user.enabled ? "停用" : "啟用"}

</button>

<button
class="btn btn-red"
onclick="deleteUser('${user.id}')">

刪除

</button>

</div>

</div>

`;

});

}

function renderPendingTable(){

const table =
document.getElementById("pendingTable");

table.innerHTML = "";

if(pendingRecords.length===0){

table.innerHTML=`
<tr>
<td colspan="${currentRole === "viewer" ? 6 : 7}">
目前尚無待借用案件
</td>
</tr>
`;

return;

}

pendingRecords
.filter(item=>item.status!=="已借出")
.forEach(item=>{

table.innerHTML += `
<tr>
<td>${item.borrower}</td>
<td>${item.department}</td>
<td>${item.projectNo}</td>
<td>${item.formNo}</td>
<td>${item.purpose}</td>
<td>

${item.status==="已轉正式借用"

? '<span class="badge badge-blue">已轉借用</span>'

: '<span class="badge badge-yellow">待借用</span>'
}

</td>

<td class="pending-action-column">

${currentRole === "viewer"

? ""

: `
<button
class="action-btn edit-btn tooltip"
data-tip="修改"
onclick="editPending('${item.id}')">

<i data-lucide="pencil"></i>

</button>

<button
class="action-btn delete-btn tooltip"
data-tip="刪除"
onclick="deletePending('${item.id}')">

<i data-lucide="trash-2"></i>

</button>

<button
class="action-btn convert-btn tooltip"
data-tip="轉正式借用"
onclick="convertPending('${item.id}')">

<i data-lucide="arrow-right-circle"></i>

</button>
`
}

</td>
</tr>
`;

});

lucide.createIcons();

}

function formatDate(date){

if(!date) return "-";

if(date.seconds){

return new Date(date.seconds * 1000)
.toLocaleString("zh-TW");

}

return new Date(date)
.toLocaleString("zh-TW");

}

function formatTableDate(date){

if(!date) return "-";

const d = date.seconds
? new Date(date.seconds * 1000)
: new Date(date);

const y = d.getFullYear();

const m = String(
d.getMonth() + 1
).padStart(2,"0");

const day = String(
d.getDate()
).padStart(2,"0");

const hh = String(
d.getHours()
).padStart(2,"0");

const mm = String(
d.getMinutes()
).padStart(2,"0");

return `
<div class="table-date">
    <div>${y}/${m}/${day}</div>
    <div class="table-time">${hh}:${mm}</div>
</div>
`;

}

function sameDate(firebaseDate,selectedDate){

if(!firebaseDate || !selectedDate)
return false;

const d1 = firebaseDate.seconds
? new Date(firebaseDate.seconds * 1000)
: new Date(firebaseDate);

const d2 = new Date(selectedDate);

return (

d1.getFullYear() === d2.getFullYear() &&
d1.getMonth() === d2.getMonth() &&
d1.getDate() === d2.getDate()

);

}

/* 部門 */

async function loadDepartments(){

const querySnapshot =
await getDocs(collection(db,"departments"));

departmentList = [];

querySnapshot.forEach((docSnap)=>{

const data = docSnap.data();

departmentList.push({

id:docSnap.id,
name:data.name,
sortOrder:Number(data.sortOrder || 999)

});

});

departmentList.sort((a,b)=>
a.sortOrder - b.sortOrder
);

renderDepartmentDropdown();
renderDepartmentMaintenance();

}

function renderDepartmentDropdown(){

const select =
document.getElementById("department");

select.innerHTML =
`<option value="">請選擇</option>`;

departmentList.forEach(dept=>{

select.innerHTML += `
<option value="${dept.name}">
${dept.name}
</option>
`;

});

}

function renderDepartmentMaintenance(){

const area =
document.getElementById("deptListArea");

area.innerHTML = "";

departmentList.forEach(dept=>{

const div =
document.createElement("div");

div.className =
"maintenance-item";

div.innerHTML = `

<div>
<strong>${dept.name}</strong>
<br>
排序：${dept.sortOrder}
</div>

<div class="maintenance-actions">

<button class="btn btn-gray"
onclick="moveDeptUp('${dept.id}')">
⬆
</button>

<button class="btn btn-gray"
onclick="moveDeptDown('${dept.id}')">
⬇
</button>

<button class="btn btn-red"
onclick="deleteDepartment('${dept.id}')">
刪除
</button>

</div>
`;

area.appendChild(div);

});

}

async function moveDeptUp(id){

if(blockViewerAction()) return;

const index =
departmentList.findIndex(d=>d.id===id);

if(index <= 0) return;

const movedDepartment =
{...departmentList[index]};

[departmentList[index - 1],
departmentList[index]] =

[departmentList[index],
departmentList[index - 1]];

for(let i=0;i<departmentList.length;i++){

await updateDoc(
doc(db,"departments",departmentList[i].id),
{
sortOrder:i + 1
}
);

}

await writeAuditLog({
action:"update",
category:"department",
targetId:id,
targetLabel:movedDepartment.name,
before:movedDepartment,
after:{
...movedDepartment,
sortOrder:index
}
});

await loadDepartments();

}

async function moveDeptDown(id){

if(blockViewerAction()) return;

const index =
departmentList.findIndex(d=>d.id===id);

if(index >= departmentList.length - 1)
return;

const movedDepartment =
{...departmentList[index]};

[departmentList[index],
departmentList[index + 1]] =

[departmentList[index + 1],
departmentList[index]];

for(let i=0;i<departmentList.length;i++){

await updateDoc(
doc(db,"departments",departmentList[i].id),
{
sortOrder:i + 1
}
);

}

await writeAuditLog({
action:"update",
category:"department",
targetId:id,
targetLabel:movedDepartment.name,
before:movedDepartment,
after:{
...movedDepartment,
sortOrder:index + 2
}
});

await loadDepartments();

}

async function addDepartment(){

if(blockViewerAction()) return;

const name =
document.getElementById("newDept")
.value.trim();

const order =
parseInt(
document.getElementById("newDeptOrder").value
);

if(!name || isNaN(order)){

alert("請完整填寫");
return;

}

const newDepartmentRef =
await addDoc(collection(db,"departments"),{

name:name,
sortOrder:order

});

await writeAuditLog({
action:"create",
category:"department",
targetId:newDepartmentRef.id,
targetLabel:name,
after:{
name,
sortOrder:order
}
});

document.getElementById("newDept").value = "";
document.getElementById("newDeptOrder").value = "";

alert("新增成功");

await loadDepartments();

}

async function deleteDepartment(id){

if(blockViewerAction()) return;

const department =
departmentList.find(item=>item.id===id);

await deleteDoc(doc(db,"departments",id));

await writeAuditLog({
action:"delete",
category:"department",
targetId:id,
targetLabel:department?.name || id,
before:department
});

alert("已刪除");

await loadDepartments();

}

/* 印鑑 */

async function loadSeals(){

const querySnapshot =
await getDocs(collection(db,"seals"));

sealList = [];

querySnapshot.forEach((docSnap)=>{

const data = docSnap.data();

sealList.push({

id:docSnap.id,
name:data.name,
sortOrder:Number(data.sortOrder || 999)

});

});

sealList.sort((a,b)=>
a.sortOrder - b.sortOrder
);

renderSealDropdown();
renderSealFilter();
renderSealMaintenance();
renderStatus();

}

function renderSealDropdown(){

const select =
document.getElementById("seal");

select.innerHTML =
`<option value="">請選擇</option>`;

sealList.forEach(seal=>{

select.innerHTML += `
<option value="${seal.name}">
${seal.name}
</option>
`;

});

}

function renderSealFilter(){

const select =
document.getElementById("sealFilter");

select.innerHTML =
`<option value="">全部印鑑</option>`;

sealList.forEach(seal=>{

select.innerHTML += `
<option value="${seal.name}">
${seal.name}
</option>
`;

});

}

function renderSealMaintenance(){

const area =
document.getElementById("sealListArea");

area.innerHTML = "";

sealList.forEach(seal=>{

const div =
document.createElement("div");

div.className =
"maintenance-item";

div.innerHTML = `

<div>
<strong>${seal.name}</strong>
<br>
排序：${seal.sortOrder}
</div>

<div class="maintenance-actions">

<button class="btn btn-gray"
onclick="moveUp('${seal.id}')">
⬆
</button>

<button class="btn btn-gray"
onclick="moveDown('${seal.id}')">
⬇
</button>

<button class="btn btn-red"
onclick="deleteSeal('${seal.id}')">
刪除
</button>

</div>
`;

area.appendChild(div);

});

}

async function moveUp(id){

if(blockViewerAction()) return;

const index =
sealList.findIndex(s=>s.id===id);

if(index <= 0) return;

const movedSeal =
{...sealList[index]};

[sealList[index - 1],
sealList[index]] =

[sealList[index],
sealList[index - 1]];

for(let i=0;i<sealList.length;i++){

await updateDoc(
doc(db,"seals",sealList[i].id),
{
sortOrder:i + 1
}
);

}

await writeAuditLog({
action:"update",
category:"seal",
targetId:id,
targetLabel:movedSeal.name,
before:movedSeal,
after:{
...movedSeal,
sortOrder:index
}
});

await loadSeals();

}

async function moveDown(id){

if(blockViewerAction()) return;

const index =
sealList.findIndex(s=>s.id===id);

if(index >= sealList.length - 1)
return;

const movedSeal =
{...sealList[index]};

[sealList[index],
sealList[index + 1]] =

[sealList[index + 1],
sealList[index]];

for(let i=0;i<sealList.length;i++){

await updateDoc(
doc(db,"seals",sealList[i].id),
{
sortOrder:i + 1
}
);

}

await writeAuditLog({
action:"update",
category:"seal",
targetId:id,
targetLabel:movedSeal.name,
before:movedSeal,
after:{
...movedSeal,
sortOrder:index + 2
}
});

await loadSeals();

}

async function addSeal(){

if(blockViewerAction()) return;

const name =
document.getElementById("newSeal")
.value.trim();

const order =
parseInt(
document.getElementById("newOrder").value
);

if(!name || isNaN(order)){

alert("請完整填寫");
return;

}

const newSealRef =
await addDoc(collection(db,"seals"),{

name:name,
sortOrder:order

});

await writeAuditLog({
action:"create",
category:"seal",
targetId:newSealRef.id,
targetLabel:name,
after:{
name,
sortOrder:order
}
});

document.getElementById("newSeal").value = "";
document.getElementById("newOrder").value = "";

alert("新增成功");

await loadSeals();

}

async function deleteSeal(id){

if(blockViewerAction()) return;

const seal =
sealList.find(item=>item.id===id);

await deleteDoc(doc(db,"seals",id));

await writeAuditLog({
action:"delete",
category:"seal",
targetId:id,
targetLabel:seal?.name || id,
before:seal
});

alert("已刪除");

await loadSeals();

}

/* 借用 */

function resetBorrowForm(){

currentPendingIndex = null;
pendingTransferDraft = null;
borrowEntryDraft = null;
selectedBorrowRecordId = null;
borrowPanelMode = "new";

const firstAvailable = sealList.find(seal=>
!records.some(record=>record.seal===seal.name && !record.returnTime)
);

selectedBorrowSeal = firstAvailable?.name || "";

populateBorrowForm({
borrower:currentUser || "",
department:"",
projectNo:"",
formNo:"",
purpose:""
});

document.getElementById("seal").value = selectedBorrowSeal;
document.getElementById("pendingTransferBanner").classList.add("hidden");
renderBorrowPanelState();
renderStatus();

}

function getBorrowFormData(){
return {
borrower:document.getElementById("borrower").value.trim(),
department:document.getElementById("department").value,
projectNo:document.getElementById("projectNo").value.trim(),
formNo:document.getElementById("formNo").value.trim(),
purpose:document.getElementById("purpose").value.trim()
};
}

function populateBorrowForm(data={}){
document.getElementById("borrower").value = data.borrower || "";
document.getElementById("department").value = data.department || "";
document.getElementById("projectNo").value = data.projectNo || "";
document.getElementById("formNo").value = data.formNo || "";
document.getElementById("purpose").value = data.purpose || "";
}

function setBorrowFormDisabled(disabled){
[
"borrower",
"department",
"projectNo",
"formNo",
"purpose"
].forEach(id=>{
const element = document.getElementById(id);
if(element) element.disabled = disabled;
});
}

function showPendingTransferDraft(){
const item = pendingRecords.find(record=>record.id===currentPendingIndex);

if(!item){
cancelPendingTransfer();
return;
}

selectedBorrowRecordId = null;
borrowPanelMode = "new";
selectedBorrowSeal = "";
document.getElementById("seal").value = "";
populateBorrowForm(pendingTransferDraft || item);

const banner = document.getElementById("pendingTransferBanner");
banner.classList.remove("hidden");
document.getElementById("pendingTransferLabel").textContent =
`｜${item.formNo || item.borrower || "未命名案件"}`;

renderBorrowPanelState();
}

function cancelPendingTransfer(){
currentPendingIndex = null;
pendingTransferDraft = null;
document.getElementById("pendingTransferBanner").classList.add("hidden");
resetBorrowForm();
}

function selectBorrowSeal(sealName){
const active = records.find(record=>
record.seal===sealName && !record.returnTime
);

selectedBorrowSeal = sealName;

if(active){
if(borrowPanelMode === "new"){
borrowEntryDraft = getBorrowFormData();

if(currentPendingIndex){
pendingTransferDraft = {...borrowEntryDraft};
}
}

selectedBorrowRecordId = active.id;
borrowPanelMode = "read";
populateBorrowForm(active);
}else{
selectedBorrowRecordId = null;
borrowPanelMode = "new";

if(currentPendingIndex && pendingTransferDraft){
populateBorrowForm(pendingTransferDraft);
}else if(document.getElementById("borrower").disabled){
populateBorrowForm(
borrowEntryDraft || {borrower:currentUser || ""}
);
}

document.getElementById("seal").value = sealName;
}

renderBorrowPanelState();
renderStatus();
}

function renderBorrowPanelState(){
const title = document.getElementById("borrowPanelTitle");
const description = document.getElementById("borrowPanelDescription");
const badge = document.getElementById("borrowModeBadge");
const meta = document.getElementById("borrowedMeta");
const summary = document.getElementById("borrowSelectionSummary");
const confirmButton = document.getElementById("confirmBorrowMainButton");
const editButton = document.getElementById("editBorrowedButton");
const saveButton = document.getElementById("saveBorrowedButton");
const cancelButton = document.getElementById("cancelBorrowEditButton");

[confirmButton,editButton,saveButton,cancelButton]
.forEach(button=>button.classList.add("hidden"));

if(selectedBorrowRecordId){
const active = records.find(record=>record.id===selectedBorrowRecordId);

if(!active || active.returnTime){
selectedBorrowRecordId = null;
borrowPanelMode = "new";
renderBorrowPanelState();
return;
}

title.textContent = borrowPanelMode === "edit"
? "編輯借用資料"
: "目前借用資料";
description.textContent = borrowPanelMode === "edit"
? "修改完成後請儲存變更"
: "此印鑑目前借出中，資料預設不可修改";

badge.textContent = borrowPanelMode === "edit" ? "編輯中" : "借出中";
badge.className = borrowPanelMode === "edit"
? "badge badge-blue"
: "badge badge-red";

meta.classList.remove("hidden");
meta.innerHTML = `
<div class="borrowed-meta-item">
<span>印鑑</span>
<b>${active.seal || "-"}</b>
</div>
<div class="borrowed-meta-item">
<span>借用時間</span>
<b>${formatDate(active.borrowTime)}</b>
</div>
<div class="borrowed-meta-item">
<span>已借用時間</span>
<b>${getBorrowDuration(active.borrowTime)}</b>
</div>`;

setBorrowFormDisabled(borrowPanelMode !== "edit");
summary.innerHTML = `<strong>印鑑：${active.seal}</strong> ・ 借出中`;

if(borrowPanelMode === "edit"){
saveButton.classList.remove("hidden");
cancelButton.textContent = "取消";
cancelButton.classList.remove("hidden");
}else if(currentPendingIndex){
cancelButton.textContent = "返回待借用案件";
cancelButton.classList.remove("hidden");
}else if(!isViewerRole()){
editButton.classList.remove("hidden");
}

lucide.createIcons();
return;
}

title.textContent = currentPendingIndex
? "待借用轉正式借用"
: "借用資料";
description.textContent = currentPendingIndex
? "資料已帶入，請從左側手動選擇一組可借用印鑑"
: selectedBorrowSeal
? "請填寫借用資訊後送出"
: "請先從左側選擇一組可借用印鑑";

meta.classList.add("hidden");
setBorrowFormDisabled(false);
confirmButton.classList.remove("hidden");
confirmButton.disabled = !selectedBorrowSeal;

if(selectedBorrowSeal){
badge.textContent = "可借用";
badge.className = "badge badge-green";
summary.innerHTML = `<strong>印鑑：${selectedBorrowSeal}</strong> ・ 可借用`;
document.getElementById("seal").value = selectedBorrowSeal;
}else{
badge.className = "badge badge-green hidden";
summary.textContent = currentPendingIndex
? "請從左側選擇本次實際借用的印鑑"
: "尚未選擇印鑑";
document.getElementById("seal").value = "";
}

lucide.createIcons();
}

function startInlineBorrowEdit(){
if(blockViewerAction()) return;
if(!selectedBorrowRecordId) return;
borrowPanelMode = "edit";
renderBorrowPanelState();
}

function cancelInlineBorrowEdit(){
if(currentPendingIndex && borrowPanelMode !== "edit"){
showPendingTransferDraft();
renderStatus();
return;
}

const active = records.find(record=>record.id===selectedBorrowRecordId);
if(!active) return;
borrowPanelMode = "read";
populateBorrowForm(active);
renderBorrowPanelState();
}

async function saveInlineBorrowEdit(){
if(blockViewerAction()) return;

const before = records.find(record=>
record.id===selectedBorrowRecordId && !record.returnTime
);

if(!before){
alert("找不到可編輯的借用資料");
return;
}

const after = getBorrowFormData();

if(!after.borrower || !after.department || !after.projectNo || !after.formNo || !after.purpose){
alert("請填寫必要欄位");
return;
}

await updateDoc(doc(db,"sealRecords",before.id),after);

await writeAuditLog({
action:"update",
category:"sealRecord",
targetId:before.id,
targetLabel:`${before.seal} / ${after.borrower}`,
before,
after:{...before,...after}
});

alert("修改成功");
borrowPanelMode = "read";
await loadRecords();
}

let pendingBorrowData = null;
let isBorrowing = false;

function borrowSeal(){

if(blockViewerAction()) return;

const borrower =
document.getElementById("borrower")
.value.trim();

const department =
document.getElementById("department")
.value;

const seal =
document.getElementById("seal")
.value;

const purpose =
document.getElementById("purpose")
.value.trim();

const projectNo =
document.getElementById("projectNo")
.value.trim();

const formNo =
document.getElementById("formNo")
.value.trim();

if(!borrower || !department || !seal || !projectNo || !formNo || !purpose){

alert("請填寫必要欄位");
return;

}

/* 防止重複借用 */

const exists =
records.find(r=>

r.seal === seal &&
!r.returnTime

);

if(exists){

alert(`印鑑 ${seal} 目前借出中，無法重複借用`);

return;

}

pendingBorrowData = {
seal,
borrower,
department,
projectNo,
formNo,
purpose,
pendingId:currentPendingIndex
};

document.getElementById("borrowConfirmSeal").textContent =
seal;

document.getElementById("borrowConfirmBorrower").textContent =
borrower;

document.getElementById("borrowConfirmDepartment").textContent =
department;

document.getElementById("borrowConfirmProjectNo").textContent =
projectNo;

document.getElementById("borrowConfirmFormNo").textContent =
formNo;

document.getElementById("borrowConfirmPurpose").textContent =
purpose;

document.getElementById("borrowConfirmOverlay").style.display =
"flex";

}

function closeBorrowConfirmModal(){

if(isBorrowing) return;

pendingBorrowData = null;

document.getElementById("borrowConfirmOverlay").style.display =
"none";

}

async function confirmBorrowSeal(){

if(blockViewerAction()) return;
if(isBorrowing || !pendingBorrowData) return;

const data = {...pendingBorrowData};

const exists =
records.find(r=>
r.seal === data.seal &&
!r.returnTime
);

if(exists){
alert(`印鑑 ${data.seal} 目前借出中，無法重複借用`);
closeBorrowConfirmModal();
await loadRecords();
return;
}

const confirmButton =
document.getElementById("confirmBorrowButton");

isBorrowing = true;
confirmButton.disabled = true;
confirmButton.textContent = "處理中...";

try{

const borrowRecordRef =
await addDoc(collection(db,"sealRecords"),{

seal:data.seal,
borrower:data.borrower || currentUser,
department:data.department,
projectNo:data.projectNo,
formNo:data.formNo,
purpose:data.purpose,
borrowTime:new Date(),
returnTime:null

});

await writeAuditLog({
action:"borrow",
category:"sealRecord",
targetId:borrowRecordRef.id,
targetLabel:`${data.seal} / ${data.borrower}`,
after:{
seal:data.seal,
borrower:data.borrower || currentUser,
department:data.department,
projectNo:data.projectNo,
formNo:data.formNo,
purpose:data.purpose,
status:"借出中"
}
});

if(data.pendingId){

const pendingItem =
pendingRecords.find(
x => x.id === data.pendingId
);

if(pendingItem){

await updateDoc(
doc(
db,
"pendingRecords",
pendingItem.id
),
{
status:"已借出"
}
);

await writeAuditLog({
action:"update",
category:"pendingRecord",
targetId:pendingItem.id,
targetLabel:pendingItem.formNo || pendingItem.borrower,
before:pendingItem,
after:{
...pendingItem,
status:"已借出"
}
});

await loadPendingRecords();

currentPendingIndex = null;

}

}

document.getElementById("borrowConfirmOverlay").style.display =
"none";

pendingBorrowData = null;

alert("借用成功");

await loadRecords();
resetBorrowForm();

}catch(error){

alert(`借用失敗：${error.message}`);

}finally{

isBorrowing = false;
confirmButton.disabled = false;
confirmButton.textContent = "確認借用";

}

}

let currentReturningId = null;
let isReturning = false;

function openReturnModal(id){

if(blockViewerAction()) return;

const record =
records.find(r=>r.id===id && !r.returnTime);

if(!record){
alert("找不到可歸還的借用資料");
return;
}

currentReturningId = id;

document.getElementById("returnConfirmSeal").textContent =
record.seal || "-";

document.getElementById("returnConfirmBorrower").textContent =
record.borrower || "-";

document.getElementById("returnConfirmDepartment").textContent =
record.department || "-";

document.getElementById("returnConfirmTime").textContent =
formatDate(record.borrowTime);

document.getElementById("returnConfirmPurpose").textContent =
record.purpose || "-";

document.getElementById("returnConfirmOverlay").style.display =
"flex";

}

function closeReturnModal(){

if(isReturning) return;

currentReturningId = null;

document.getElementById("returnConfirmOverlay").style.display =
"none";

}

async function confirmReturnSeal(){

if(blockViewerAction()) return;
if(isReturning || !currentReturningId) return;

const record =
records.find(
r=>r.id===currentReturningId && !r.returnTime
);

if(!record){
alert("此筆資料可能已完成歸還，請重新整理");
closeReturnModal();
loadRecords();
return;
}

const confirmButton =
document.getElementById("confirmReturnButton");

isReturning = true;
confirmButton.disabled = true;
confirmButton.textContent = "處理中...";

try{

const returningId =
currentReturningId;

const returnTime =
new Date();

await updateDoc(
doc(db,"sealRecords",returningId),
{
returnTime
}
);

await writeAuditLog({
action:"return",
category:"sealRecord",
targetId:returningId,
targetLabel:`${record.seal} / ${record.borrower}`,
before:record,
after:{
...record,
returnTime:returnTime.toISOString(),
status:"已歸還"
}
});

document.getElementById("returnConfirmOverlay").style.display =
"none";

currentReturningId = null;

alert("已歸還");

await loadRecords();

}catch(error){

alert(`歸還失敗：${error.message}`);

}finally{

isReturning = false;
confirmButton.disabled = false;
confirmButton.textContent = "確認歸還";

}

}

async function loadRecords(){

const querySnapshot =
await getDocs(collection(db,"sealRecords"));

records = [];

querySnapshot.forEach((docSnap)=>{

records.push({

id:docSnap.id,
...docSnap.data()

});

});

renderTable();
renderReturnTable();
renderStatus();
updateKPI();

}

function updateKPI(){

const borrowed =
records.filter(
r=>!r.returnTime
).length;

const available =
sealList.length - borrowed;

const borrowedElement =
document.getElementById('borrowBorrowedCount');

const availableElement =
document.getElementById('borrowAvailableCount');

if(borrowedElement) borrowedElement.innerText = borrowed;
if(availableElement) availableElement.innerText = available;

}




function getBorrowDuration(borrowTime){
if(!borrowTime) return "-";
const start = borrowTime.seconds ? borrowTime.seconds*1000 : new Date(borrowTime).getTime();
const diff = Date.now() - start;
const days = Math.floor(diff/86400000);
const hours = Math.floor((diff%86400000)/3600000);
const mins = Math.floor((diff%3600000)/60000);
return `${days}天${hours}小時${mins}分`;
}

function legacyShowSealDetail(sealName){
document.querySelectorAll('#statusGrid .card').forEach(c=>c.classList.remove('selected'));
const target=document.querySelector(`[data-seal="${sealName}"]`);
if(target) target.classList.add('selected');

const active = records.find(r=>r.seal===sealName && !r.returnTime);
const el=document.getElementById('sealDetailContent');

if(!active){
const sealSelect =
document.getElementById("seal");

if(sealSelect){
sealSelect.value = sealName;
}

el.innerHTML=`
<div class="detail-card">
<div class="detail-grid">
<div class="detail-item">
<div class="detail-label">印鑑名稱</div>
<div class="detail-value">${sealName}</div>
</div>
<div class="detail-item">
<div class="detail-label">狀態</div>
<div class="detail-value">
<span class="badge badge-green">
可借用
</span>
</div>
</div>
</div>
<div style="margin-top:15px;padding:12px;background:#ecfdf5;border-radius:12px;">
目前無借用案件
</div>
</div>`;
return;
}

el.innerHTML=`
<div class="detail-card">
<div class="detail-grid">
<div class="detail-item"><div class="detail-label">印鑑名稱</div><div class="detail-value">${sealName}</div></div>
<div class="detail-item"><div class="detail-label">狀態</div><div class="detail-value">
<span class="badge badge-red">
借出中
</span>
</div></div>
<div class="detail-item"><div class="detail-label">借用人</div><div class="detail-value">${active.borrower}</div></div>
<div class="detail-item"><div class="detail-label">部門</div><div class="detail-value">${active.department}</div></div>
<div class="detail-item"><div class="detail-label">計畫編號</div><div class="detail-value">${active.projectNo||''}</div></div>
<div class="detail-item"><div class="detail-label">表單編號</div><div class="detail-value">${active.formNo||''}</div></div>
<div class="detail-item"><div class="detail-label">借用時間</div><div class="detail-value">${formatDate(active.borrowTime)}</div></div>
<div class="detail-item"><div class="detail-label">已借用時間</div><div class="detail-value">${getBorrowDuration(active.borrowTime)}</div></div>
</div>
<div class="purpose-card">
<div class="purpose-title">用途</div>
<div class="purpose-content">${active.purpose||''}</div>
</div>
</div>`;
}

function legacyRenderStatus(){

const grid =
document.getElementById("statusGrid");

grid.innerHTML = "";

sealList.forEach(seal=>{

const active =
records.find(r=>

r.seal===seal.name &&
!r.returnTime

);

const card =
document.createElement("div");

card.className =
active ? "card borrowed" : "card available";

card.setAttribute('data-seal',seal.name); card.onclick=()=>showSealDetail(seal.name);
card.innerHTML = `

<div style="
font-size:13px;
color:#64748b;
margin-bottom:8px;
">
印鑑
</div>

<div style="
font-size:20px;
font-weight:700;
margin-bottom:12px;
">
${seal.name}
</div>

<div style="
font-size:14px;
font-weight:600;
color:${active ? '#dc2626' : '#16a34a'};
">
${active
? `借出中｜${active.borrower}`
: '目前可借用'}
</div>

`;

grid.appendChild(card);

});

if(sealList.length){
showSealDetail(sealList[0].name);
}

}

/* 借用登記新版：緊湊狀態清單與左右工作台 */
function showSealDetail(sealName){
selectBorrowSeal(sealName);
}

function renderStatus(){
const list = document.getElementById("statusGrid");
if(!list) return;

const keyword = (
document.getElementById("borrowSealSearch")?.value || ""
).trim().toLowerCase();

const activeForSelected = records.find(record=>
record.seal===selectedBorrowSeal && !record.returnTime
);

if(
!currentPendingIndex &&
borrowPanelMode === "new" &&
activeForSelected
){
selectedBorrowSeal = "";
document.getElementById("seal").value = "";
}

if(!currentPendingIndex && !selectedBorrowSeal){
const firstAvailable = sealList.find(seal=>
!records.some(record=>record.seal===seal.name && !record.returnTime)
);

if(firstAvailable){
selectedBorrowSeal = firstAvailable.name;
document.getElementById("seal").value = firstAvailable.name;

if(!document.getElementById("borrower").value){
document.getElementById("borrower").value = currentUser || "";
}
}
}

const visibleSeals = sealList.filter(seal=>
!keyword || seal.name.toLowerCase().includes(keyword)
);

list.innerHTML = "";

visibleSeals.forEach(seal=>{
const active = records.find(record=>
record.seal===seal.name && !record.returnTime
);

const row = document.createElement("button");
row.type = "button";
row.className = [
"seal-status-row",
active ? "is-borrowed" : "is-available",
selectedBorrowSeal===seal.name ? "selected" : ""
].filter(Boolean).join(" ");
row.setAttribute("data-seal",seal.name);
row.onclick = ()=>selectBorrowSeal(seal.name);

row.innerHTML = `
<div class="seal-row-main">
<div class="seal-row-name">${seal.name}</div>
${active
? `<div class="seal-row-person">借用人：${active.borrower || "-"}</div>`
: ""}
</div>
<div class="seal-row-status-wrap">
<div class="seal-row-status">
${active ? "借出中" : "可借用"}
</div>
${selectedBorrowSeal===seal.name && !active
? `<span class="seal-row-check"><i data-lucide="check"></i></span>`
: active
? `<span class="btn-link">查看</span>`
: `<i data-lucide="chevron-right"></i>`}
</div>`;

list.appendChild(row);
});

if(!visibleSeals.length){
list.innerHTML = `<div class="seal-empty-state">找不到符合的印鑑</div>`;
}

if(selectedBorrowRecordId){
const active = records.find(record=>
record.id===selectedBorrowRecordId && !record.returnTime
);

if(active && borrowPanelMode !== "edit"){
populateBorrowForm(active);
}
}

renderBorrowPanelState();
lucide.createIcons();
}



function renderReturnTable(){

const table =
document.getElementById("returnTable");

if(!table) return;

table.innerHTML = "";

records
.filter(r=>!r.returnTime)
.forEach(r=>{

const tr =
document.createElement("tr");

tr.innerHTML = `

<td>${r.seal}</td>
<td>${r.borrower}</td>
<td>${r.department}</td>
<td>${r.projectNo || ""}</td>
<td>${r.formNo || ""}</td>
<td>${r.purpose}</td>
<td>${formatDate(r.borrowTime)}</td>

<td>
<button
class="action-btn convert-btn tooltip"
data-tip="歸還"
onclick="openReturnModal('${r.id}')">

<i data-lucide="rotate-ccw"></i>

</button>
</td>
`;

table.appendChild(tr);

});

lucide.createIcons();

}


function getLocalDateKey(value){

if(!value) return "";

const date =
value.seconds
? new Date(value.seconds * 1000)
: value.toDate
? value.toDate()
: new Date(value);

if(Number.isNaN(date.getTime())) return "";

const year = date.getFullYear();
const month = String(date.getMonth() + 1).padStart(2,"0");
const day = String(date.getDate()).padStart(2,"0");

return `${year}-${month}-${day}`;

}

function matchesDateRange(value,startDate,endDate){

if(!startDate && !endDate) return true;

const dateKey = getLocalDateKey(value);

if(!dateKey) return false;
if(startDate && dateKey < startDate) return false;
if(endDate && dateKey > endDate) return false;

return true;

}

function getRecordTime(value){

if(!value) return 0;

if(value.seconds){

const seconds = Number(value.seconds || 0) * 1000;
const nanos = Number(value.nanoseconds || 0) / 1000000;

return seconds + nanos;

}

if(value.toDate) return value.toDate().getTime();

const date = new Date(value);
return Number.isNaN(date.getTime()) ? 0 : date.getTime();

}

function getFilteredRecords(){

const keyword =
document.getElementById("searchInput")
.value.toLowerCase();

const sealFilter =
document.getElementById("sealFilter")
.value;

const statusFilter =
document.getElementById("statusFilter")
?.value || "";

const projectFilter =
(document.getElementById("projectFilter")?.value || "").toLowerCase();

const formFilter =
(document.getElementById("formFilter")?.value || "").toLowerCase();

const borrowDateStart =
document.getElementById("borrowDateStart")
.value;

const borrowDateEnd =
document.getElementById("borrowDateEnd")
.value;

const returnDateStart =
document.getElementById("returnDateStart")
.value;

const returnDateEnd =
document.getElementById("returnDateEnd")
.value;

return records
.filter(r=>{

const keywordMatch =

(r.borrower || "")
.toLowerCase()
.includes(keyword)

||

(r.department || "")
.toLowerCase()
.includes(keyword)

||

(r.purpose || "")
.toLowerCase()
.includes(keyword)

||

(r.projectNo || "")
.toLowerCase()
.includes(keyword)

||

(r.formNo || "")
.toLowerCase()
.includes(keyword);

const sealMatch =

!sealFilter ||

r.seal === sealFilter;

const projectMatch =
!projectFilter ||
((r.projectNo || "").toLowerCase().includes(projectFilter));

const formMatch =
!formFilter ||
((r.formNo || "").toLowerCase().includes(formFilter));

const borrowMatch =
matchesDateRange(
r.borrowTime,
borrowDateStart,
borrowDateEnd
);

const returnMatch =
matchesDateRange(
r.returnTime,
returnDateStart,
returnDateEnd
);

const statusMatch =

!statusFilter ||

(statusFilter==="borrowed" && !r.returnTime) ||

(statusFilter==="returned" && r.returnTime);

return (

keywordMatch &&
sealMatch &&
projectMatch &&
formMatch &&
borrowMatch &&
returnMatch &&
statusMatch

);

})
.sort((a,b)=>{

const t1 = getRecordTime(a.borrowTime);
const t2 = getRecordTime(b.borrowTime);

return t2 - t1;

});

}

function renderTable(){

const table =
document.getElementById("recordTable");

table.innerHTML = "";

const filteredRecords =
getFilteredRecords();

const countEl =
document.getElementById("recordCount");

if(countEl){

countEl.textContent =
filteredRecords.length;

}

const totalPages =
Math.ceil(filteredRecords.length / pageSize);

if(currentPage > totalPages){
currentPage = 1;
}

const start =
(currentPage - 1) * pageSize;

const end =
start + pageSize;

const pageRecords =
filteredRecords.slice(start,end);

pageRecords.forEach(r=>{

const tr =
document.createElement("tr");

tr.innerHTML = `

<td>${r.seal}</td>

<td>${r.borrower}</td>

<td>${r.department}</td>

<td>${r.projectNo || ""}</td>

<td>${r.formNo || ""}</td>

<td>${r.purpose}</td>

<td>${formatTableDate(r.borrowTime)}</td>

<td>${formatTableDate(r.returnTime)}</td>

<td>

${r.returnTime

? '<span class="badge badge-green">已歸還</span>'

: '<span class="badge badge-red">借出中</span>'

}

</td>

<td class="record-action-column">

${currentRole === "viewer"

? ""

: r.returnTime

? `
<span style="
color:#94a3b8;
font-weight:600;
font-size:16px;
">
—
</span>
`

: `

<button
class="action-btn edit-btn tooltip"
data-tip="修改"
onclick="editRecord('${r.id}')">

<i data-lucide="pencil"></i>

</button>

<button
class="action-btn delete-btn tooltip"
data-tip="刪除"
onclick="deleteRecord('${r.id}')">

<i data-lucide="trash-2"></i>

</button>

`

}

</td>

`;

table.appendChild(tr);

});

renderPagination(totalPages);

lucide.createIcons();

}


function renderPagination(totalPages){

const area =
document.getElementById("paginationArea");

area.innerHTML = "";

if(totalPages <= 1) return;

function createPageButton(label,page,disabled=false,active=false){

const btn =
document.createElement("button");

btn.className = "btn";

btn.innerText = label;

btn.disabled = disabled;

btn.style.background =
active
? "#2563eb"
: disabled
? "#f1f5f9"
: "#e2e8f0";

btn.style.color =
active
? "white"
: disabled
? "#94a3b8"
: "black";

btn.style.cursor =
disabled
? "not-allowed"
: "pointer";

btn.onclick = ()=>{

if(disabled) return;

currentPage = page;
renderTable();

};

return btn;

}

area.appendChild(
createPageButton("上一頁",currentPage - 1,currentPage === 1)
);

for(let i=1;i<=totalPages;i++){

area.appendChild(
createPageButton(i,i,false,i === currentPage)
);

}

area.appendChild(
createPageButton("下一頁",currentPage + 1,currentPage === totalPages)
);

}

function changePageSize(){

pageSize = parseInt(
document.getElementById("pageSizeSelect").value
);

currentPage = 1;

renderTable();

}




function closeEditModal(){
document.getElementById('editOverlay').style.display='none';
}

async function editRecord(id){
if(blockViewerAction()) return;

const r = records.find(x=>x.id===id);
if(!r || r.returnTime){ alert('已歸還資料不可編輯'); return; }

document.getElementById('editId').value=id;
document.getElementById('editBorrower').value=r.borrower||'';
document.getElementById('editDepartment').value=r.department||'';
document.getElementById('editProjectNo').value=r.projectNo||'';
document.getElementById('editFormNo').value=r.formNo||'';
document.getElementById('editPurpose').value=r.purpose||'';

document.getElementById('editOverlay').style.display='flex';
}

async function saveEditRecord(){
if(blockViewerAction()) return;

const id=document.getElementById('editId').value;

const before =
records.find(item=>item.id===id);

const after = {
borrower:document.getElementById('editBorrower').value,
department:document.getElementById('editDepartment').value,
projectNo:document.getElementById('editProjectNo').value,
formNo:document.getElementById('editFormNo').value,
purpose:document.getElementById('editPurpose').value
};

await updateDoc(
doc(db,"sealRecords",id),
after
);

await writeAuditLog({
action:"update",
category:"sealRecord",
targetId:id,
targetLabel:`${before?.seal || "印鑑"} / ${after.borrower}`,
before,
after:{
...before,
...after
}
});

closeEditModal();
alert('修改成功');
loadRecords();
}

async function deleteRecord(id){

if(blockViewerAction()) return;

const r = records.find(x=>x.id===id);

if(r && r.returnTime){
alert("已歸還資料不可刪除");
return;
}

if(!confirm("確定刪除此借用紀錄？")) return;

await deleteDoc(doc(db,"sealRecords",id));

await writeAuditLog({
action:"delete",
category:"sealRecord",
targetId:id,
targetLabel:`${r?.seal || "印鑑"} / ${r?.borrower || id}`,
before:r
});

alert("刪除成功");
loadRecords();
}


function exportExcel(){

if(blockViewerAction()) return;

const borrowStart =
document.getElementById("borrowDateStart").value;

const borrowEnd =
document.getElementById("borrowDateEnd").value;

const returnStart =
document.getElementById("returnDateStart").value;

const returnEnd =
document.getElementById("returnDateEnd").value;

if(
(borrowStart && borrowEnd && borrowStart > borrowEnd) ||
(returnStart && returnEnd && returnStart > returnEnd)
){
alert("日期區間的起日不可晚於迄日");
return;
}

const filteredRecords =
getFilteredRecords();

if(filteredRecords.length===0){
alert("目前篩選條件沒有可匯出的資料");
return;
}

const data =
filteredRecords.map(r=>({

印鑑:r.seal,
借用人:r.borrower,
部門:r.department,
計畫編號:r.projectNo || "",
表單編號:r.formNo || "",
借用時間:formatDate(r.borrowTime),
歸還時間:formatDate(r.returnTime),
用途:r.purpose,
狀態:r.returnTime ? "已歸還" : "借出中"

}));

const ws =
XLSX.utils.json_to_sheet(data);

ws["!cols"] = [
{wch:16},
{wch:14},
{wch:16},
{wch:18},
{wch:18},
{wch:20},
{wch:20},
{wch:36},
{wch:12}
];

if(ws["!ref"]){
ws["!autofilter"] = {ref:ws["!ref"]};
}

const wb =
XLSX.utils.book_new();

XLSX.utils.book_append_sheet(
wb,
ws,
"印鑑借用紀錄"
);

XLSX.writeFile(
wb,
`印鑑借用紀錄_${getLocalDateKey(new Date())}.xlsx`
);

}

window.borrowSeal = borrowSeal;
window.closeBorrowConfirmModal = closeBorrowConfirmModal;
window.confirmBorrowSeal = confirmBorrowSeal;
window.cancelPendingTransfer = cancelPendingTransfer;
window.startInlineBorrowEdit = startInlineBorrowEdit;
window.cancelInlineBorrowEdit = cancelInlineBorrowEdit;
window.saveInlineBorrowEdit = saveInlineBorrowEdit;
window.openReturnModal = openReturnModal;
window.closeReturnModal = closeReturnModal;
window.confirmReturnSeal = confirmReturnSeal;
window.exportExcel = exportExcel;
window.editRecord = editRecord;
window.deleteRecord = deleteRecord;
window.closeEditModal=closeEditModal;
window.saveEditRecord=saveEditRecord;

window.addSeal = addSeal;
window.deleteSeal = deleteSeal;
window.moveUp = moveUp;
window.moveDown = moveDown;

window.addDepartment = addDepartment;
window.deleteDepartment = deleteDepartment;
window.moveDeptUp = moveDeptUp;
window.moveDeptDown = moveDeptDown;

document.getElementById("borrowSealSearch")
.addEventListener("input",renderStatus);

document.getElementById("searchInput")
.addEventListener("input",renderTable);

document.getElementById("sealFilter")
.addEventListener("change",renderTable);

document.getElementById("statusFilter")
.addEventListener("change",renderTable);

document.getElementById("projectFilter")
.addEventListener("input",renderTable);

document.getElementById("formFilter")
.addEventListener("input",renderTable);

[
"borrowDateStart",
"borrowDateEnd",
"returnDateStart",
"returnDateEnd"
].forEach(id=>{

document.getElementById(id)
.addEventListener("change",()=>{
currentPage = 1;
renderTable();
});

});

document.getElementById("auditSearch")
.addEventListener("input",()=>{
auditCurrentPage = 1;
renderAuditLogs();
});

[
"auditActionFilter",
"auditDateStart",
"auditDateEnd"
].forEach(id=>{

document.getElementById(id)
.addEventListener("change",()=>{
auditCurrentPage = 1;
renderAuditLogs();
});

});

async function googleLogin(){

try{

await signInWithPopup(
auth,
provider
);

}catch(error){

alert(error.message);

}

}

window.googleLogin = googleLogin;

async function logout(){

sessionStorage.removeItem(
"loginLogged"
);

localStorage.removeItem(
"userRole"
);

localStorage.removeItem(
"userEmail"
);

localStorage.removeItem(
"userName"
);

await signOut(auth);

}


window.logout = logout;

onAuthStateChanged(auth, async(user)=>{


if(!user){

document.getElementById("loginPage").style.display="flex";
document.getElementById("systemArea").style.display="none";

return;

}

const snapshot =
await getDocs(collection(db,"users"));

let allow = false;
let loginUserData = null;

snapshot.forEach(docSnap=>{

const data = docSnap.data();

if(
data.email === user.email &&
data.enabled === true
){

allow = true;
loginUserData = {
id:docSnap.id,
...data
};

currentRole = normalizeRole(data.role);

}

});

if(!allow){

alert("此帳號未開通");

await signOut(auth);

return;

}

currentUser =
getUserDisplayName(loginUserData || {
name:user.displayName,
email:user.email
});

currentUserEmail =
user.email;

localStorage.setItem(
"userRole",
currentRole
);

localStorage.setItem(
"userEmail",
user.email
);

localStorage.setItem(
"userName",
currentUser
);

if(!sessionStorage.getItem("loginLogged")){

await addDoc(
collection(db,"loginLogs"),
{
name:currentUser,
email:user.email,
role:currentRole,
loginTime:new Date()
});

sessionStorage.setItem(
"loginLogged",
"true"
);

}

document.getElementById(
"sidebarUserName"
).textContent =
currentUser;

document.getElementById(
"sidebarUserEmail"
).textContent =
user.email;

document.getElementById(
"loginPage"
).style.display="none";

applyRoleAccess();
restoreLastPage();

if(isViewerRole()){

await Promise.all([
    loadSeals(),
    loadRecords(),
    loadPendingRecords()
]);

}else{

await Promise.all([
    loadDepartments(),
    loadSeals(),
    loadRecords(),
    loadPendingRecords(),
    loadUsers(),
    loadLoginLogs()
]);

}

document.getElementById(
"systemArea"
).style.display="block";

requestAnimationFrame(()=>{

document.getElementById(
"systemArea"
).style.opacity="1";

});

if(!isAdminRole()){

document.getElementById(
"permissionMenu"
).style.display = "none";

document.getElementById(
"loginLogMenu"
).style.display = "none";

document.getElementById(
"auditLogMenu"
).style.display = "none";

}


});



/* Page-level UI initialization */

document.addEventListener('contextmenu', e => e.preventDefault());

document.addEventListener('keydown', function(e){
    const k = (e.key || '').toLowerCase();

 
    if(e.ctrlKey && k === 'u') { e.preventDefault(); return false; }
    if(e.ctrlKey && k === 's') { e.preventDefault(); return false; }

    if(e.ctrlKey && e.shiftKey &&
       (k === 'i' || k === 'j' || k === 'c')) {
        e.preventDefault();
        return false;
    }
});

lucide.createIcons();

const sidebar =
document.querySelector(".sidebar");

const toggle =
document.getElementById("sidebarToggle");

/* v13 TopNav 版沒有左側 sidebar；保留相容舊版的切換程式 */
if(sidebar && toggle){

/* 還原上次狀態 */
if(
localStorage.getItem("sidebarState")
==="collapsed"
){
sidebar.classList.add("collapsed");
}

/* 切換 */
toggle.addEventListener("click",()=>{
sidebar.classList.toggle("collapsed");
localStorage.setItem(
"sidebarState",
sidebar.classList.contains("collapsed")
? "collapsed"
: "expanded"
);
});

}

})().catch(error=>{

console.error("系統初始化失敗",error);
alert(`系統初始化失敗：${error.message}`);

});
