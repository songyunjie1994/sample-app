/* Backend transport only. Existing page markup, styles and URL are unchanged. */
(function () {
  'use strict';
  var API = 'https://qskjpexmoerowosnhidj.supabase.co/rest/v1/rpc/sample_api';
  var PUBLIC_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFza2pwZXhtb2Vyb3dvc25oaWRqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI1NTE5NzEsImV4cCI6MjEwODEyNzk3MX0.Cbz7RjmIHLbbYwImanzl8O9wsNJfD6n8Zq_ne_Hz2Nw';
  var TOKEN_KEY = 'sampleBackendSession20261021';
  var CACHE_BACKUP_KEY = 'sampleDataBeforeAnbito20261021';
  function clone(value) { return JSON.parse(JSON.stringify(value)); }
  function escapeHtml(value) { return String(value).replace(/[&<>"']/g, function (c) { return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]; }); }
  window.installSampleBackendBridge = function () {
    var revision = null, committed = null, queue = Promise.resolve(), repeatTimer;
    var session = localStorage.getItem(TOKEN_KEY) || '';
    try {
      var previous = localStorage.getItem('sampleData');
      if (previous && !localStorage.getItem(CACHE_BACKUP_KEY)) localStorage.setItem(CACHE_BACKUP_KEY, previous);
    } catch (_) { /* Never clear a full cache to make room. */ }
    data = {nextId:1, submissions:[], adminPassword:''};
    SUPABASE_URL = 'https://qskjpexmoerowosnhidj.supabase.co';
    SUPABASE_KEY = PUBLIC_KEY;
    isCloudMode = true;
    async function api(action, payload) {
      var headers = {'Content-Type':'application/json', apikey:PUBLIC_KEY};
      if (session) headers['x-sample-token'] = session;
      var response = await fetch(API, {method:'POST', headers:headers, body:JSON.stringify({p_action:action, p_payload:payload || {}}), cache:'no-store'});
      var result;
      try { result = await response.json(); } catch (_) { throw new Error('后台响应异常，请稍后重试'); }
      if (!response.ok || !result.ok) {
        var error = new Error(result.error || '后台暂时不可用，请稍后重试');
        error.code = result.code || response.status;
        throw error;
      }
      return result;
    }
    function accept(result) {
      if (!result.data || !Array.isArray(result.data.submissions)) throw new Error('后台寄样数据格式异常');
      data = result.data;
      data.adminPassword = '';
      revision = result.revision;
      committed = clone(data);
      try { localStorage.setItem('sampleData', JSON.stringify(data)); } catch (_) { toast('云端已读取，本地缓存空间不足','info'); }
      return data;
    }
    function showFailure(error) {
      updateSyncStatus('⚠️ 未保存');
      toast(error.message || '保存失败，请稍后重试','error');
    }
    sbLoad = async function () {
      if (!session) { await api('ping'); return null; }
      return accept(await api('load'));
    };
    sbSave = function (value, allowDelete) {
      var snapshot = clone(value);
      var operation = queue.catch(function () {}).then(async function () {
        if (!session || revision === null) throw new Error('请先输入管理密码登录');
        updateSyncStatus('☁️ 同步中...');
        var result = await api('save', {data:snapshot, revision:revision, allowDelete:!!allowDelete});
        revision = result.revision;
        committed = clone(snapshot);
        try { localStorage.setItem('sampleData', JSON.stringify(snapshot)); } catch (_) {}
        updateSyncStatus('☁️ 已同步');
        return true;
      });
      queue = operation;
      return operation.catch(function (error) {
        if (committed) data = clone(committed);
        try { renderList(); } catch (_) {}
        showFailure(error);
        throw error;
      });
    };
    saveData = function (value, allowDelete) { return sbSave(value, allowDelete); };
    initData = async function () {
      try {
        await sbLoad();
        showBadge('☁️ 云同步');
        if (session && location.hash === '#admin') showAdmin();
      } catch (error) {
        showBadge('☁️⚠️ 未连接');
        if (error.code === 401) { session=''; localStorage.removeItem(TOKEN_KEY); }
        toast(error.message,'error');
      }
    };
    doLogin = async function () {
      var password = document.getElementById('loginPassword').value;
      try {
        var result = await api('login', {password:password});
        session = result.token;
        localStorage.setItem(TOKEN_KEY, session);
        localStorage.setItem('adminLoggedIn','1');
        accept(result);
        document.getElementById('loginPassword').value='';
        showAdmin();
        showBadge('☁️ 云同步');
        toast('登录成功','success');
      } catch (error) { toast(error.message,'error'); }
    };
    checkLogin = async function () {
      if (session) {
        try { await sbLoad(); showAdmin(); return; }
        catch (error) { if(error.code===401){session='';localStorage.removeItem(TOKEN_KEY);}else{toast(error.message,'error');} }
      }
      document.getElementById('loginView').classList.remove('hidden');
      document.getElementById('adminView').classList.add('hidden');
      showPage('admin');
    };
    logout = async function () {
      try { if(session) await api('logout'); } catch (_) {}
      session=''; localStorage.removeItem(TOKEN_KEY);
      document.getElementById('loginView').classList.remove('hidden');
      document.getElementById('adminView').classList.add('hidden');
      toast('已退出','info');
    };
    showSettings = function () {
      document.getElementById('setPassword').value='';
      document.getElementById('settingsModal').style.display='flex';
    };
    savePassword = async function () {
      var password=document.getElementById('setPassword').value.trim();
      if(password.length<4){toast('密码至少4位','error');return;}
      try {
        var result=await api('password',{password:password});revision=result.revision;
        document.getElementById('setPassword').value='';
        toast('密码已更新','success');
      } catch(error){toast(error.message,'error');}
    };
    checkRepeatPhone = function () {
      clearTimeout(repeatTimer);
      var phone=document.getElementById('phone').value.trim(), warning=document.getElementById('repeatWarning');
      if(!phone){warning.classList.add('hidden');return;}
      repeatTimer=setTimeout(async function(){
        try{var result=await api('repeat',{phone:phone});if(document.getElementById('phone').value.trim()===phone)warning.classList.toggle('hidden',!result.repeat);}catch(_){}
      },400);
    };
    document.getElementById('submitForm').addEventListener('submit',async function(event){
      event.preventDefault();event.stopImmediatePropagation();
      var form=document.getElementById('submitForm'),button=document.getElementById('submitBtn');
      if(button.disabled)return;
      var field=function(id){return document.getElementById(id).value.trim();};
      var items=getItems();
      var record={business:field('business'),talentName:field('talentName'),name:field('name'),phone:field('phone'),province:field('province'),city:field('city'),district:field('district'),detailAddress:field('address'),shipDate:field('shipDate'),description:field('description'),repeatReason:field('repeatReason'),isSF:document.querySelector('input[name="sfRadio"]:checked').value,items:JSON.stringify(items),product:items[0]&&items[0].product,quantity:items[0]&&items[0].quantity,itemSummary:items.map(function(it){return it.product+'×'+it.quantity;}).join('、')};
      if(!record.business||!record.talentName||!record.name||!record.phone||!record.province||!record.city||!record.district||!record.detailAddress||!record.shipDate||!items.length){toast('请填写全部必填信息及货品','error');return;}
      if(!form.dataset.sampleOrderNumber)form.dataset.sampleOrderNumber=orderNum();
      record.orderNumber=form.dataset.sampleOrderNumber;
      button.disabled=true;button.textContent='提交中...';
      try{
        await api('submit',{record:record});
        document.getElementById('formView').classList.add('hidden');
        document.getElementById('successView').classList.remove('hidden');
        toast('提交成功！','success');
        if(session)await sbLoad();
      }catch(error){toast(error.message,'error');}
      finally{button.disabled=false;button.textContent='提交申请';}
    },true);
    var oldReset=resetForm;
    resetForm=function(){delete document.getElementById('submitForm').dataset.sampleOrderNumber;oldReset();};
    queryTracking=async function(){
      var phone=document.getElementById('trackingPhone').value.trim(),business=document.getElementById('trackingName').value.trim();
      if(!phone&&!business){toast('请输入手机号或商务名','error');return;}
      try{
        var result=await api('lookup',{phone:phone,business:business}),items=result.rows,list=document.getElementById('trackingResult');
        _lastSearchResults=items;
        if(!items.length){list.innerHTML='<div style="text-align:center;padding:20px;color:var(--text2)">未找到匹配记录</div>';return;}
        list.innerHTML='<div style="font-size:13px;font-weight:600;margin-bottom:8px">共 '+items.length+' 条记录 <button class="btn btn-sm btn-primary" onclick="exportSearchResult()" style="width:auto;padding:3px 12px;font-size:12px;margin-left:8px">📤 导出</button></div>'+items.map(renderUserCard).join('');
        toast('找到 '+items.length+' 条','success');
      }catch(error){toast(error.message,'error');}
    };
    review=async function(orderNumber,action){
      var record=data.submissions.find(function(s){return s.orderNumber===orderNumber;});
      if(!record||record.status!=='pending'){renderList();return;}
      record.status=action;record.updated_at=nowStr();
      try{await saveData(data);renderList();toast(action==='approved'?'✅ 已通过':'❌ 已拒绝','success');}catch(_){}
    };
    delItem=async function(orderNumber){
      if(!confirm('确定删除吗？不可恢复！'))return;
      var index=data.submissions.findIndex(function(s){return s.orderNumber===orderNumber;});if(index<0)return;
      data.submissions.splice(index,1);
      try{await saveData(data,true);renderList();toast('已删除','info');}catch(_){}
    };
    updateShipDate=async function(orderNumber,value){
      var record=data.submissions.find(function(s){return s.orderNumber===orderNumber;});if(!record)return;
      record.shipDate=value;record.updated_at=nowStr();
      try{await saveData(data);renderList();toast('发货日期已更新','success');}catch(_){}
    };
    uploadTrackingCSV=async function(){
      var file=document.getElementById('csvFileInput').files[0],result=document.getElementById('csvResult');
      if(!file){result.textContent='请选择 CSV 文件';return;}
      try{
        var lines=(await file.text()).split('\n').filter(function(line){return line.trim();}),ok=0,fail=0;
        if(lines.length<2)throw new Error('CSV 文件为空');
        lines.slice(1).forEach(function(line){var parts=line.trim().split(','),order=parts[0]&&parts[0].trim(),carrier=parts[1]&&parts[1].trim(),tracking=parts.slice(2).join(',').trim();var record=data.submissions.find(function(s){return s.orderNumber===order;});if(!record||!tracking||parts.length<3){fail++;return;}record.trackingCompany=carrier;record.trackingNumber=tracking;record.trackingTime=nowStr();record.updated_at=nowStr();ok++;});
        if(ok)await saveData(data);
        result.textContent='✅ 成功 '+ok+' 条'+(fail?'，失败 '+fail+' 条':'');renderList();
      }catch(error){result.textContent='未保存：'+error.message;}
    };
    importData=async function(event){
      var input=event.target,file=input.files[0];if(!file)return;
      try{var imported=JSON.parse(await file.text());if(!imported.data||!Array.isArray(imported.data.submissions))throw new Error('文件格式无效');if(!confirm('导入将覆盖现有数据，确认继续？'))return;var candidate=clone(imported.data);await saveData(candidate,true);data=candidate;data.adminPassword='';toast('导入成功！共 '+data.submissions.length+' 条记录','success');refreshAdmin();closeSettings();}catch(error){toast(error.message,'error');}finally{input.value='';}
    };
    restoreBackup=async function(index){
      var backup=(data.backups||[])[index];if(!backup||!Array.isArray(backup.data))return;
      if(!confirm('确定恢复到 '+backup.time+' ('+backup.count+'条)的版本？'))return;
      var candidate=clone(data);candidate.submissions=clone(backup.data);
      candidate.nextId=Math.max(candidate.nextId||1,Math.max.apply(null,candidate.submissions.map(function(s){return Number(s.id)||0;}))+1);
      try{await saveData(candidate,true);data=candidate;refreshAdmin();closeSettings();toast('已恢复历史版本','success');}catch(_){}
    };
    function safeRenderer(renderer){return function(record){var escaped={};Object.keys(record).forEach(function(key){escaped[key]=typeof record[key]==='string'?escapeHtml(record[key]):record[key];});escaped.orderNumber=/^[0-9]{8,24}(-[0-9]+)?$/.test(record.orderNumber||'')?record.orderNumber:'';return renderer(escaped);};}
    renderCard=safeRenderer(renderCard);renderUserCard=safeRenderer(renderUserCard);
    window.sampleBackendInfo={project:'anbito-operations',version:'sample-20261021-1',urlUnchanged:true};
  };
}());
