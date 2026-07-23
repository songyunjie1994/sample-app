const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const PORT = process.env.PORT || 3001;

// Supabase 配置（跟前端保持一致）
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://mabxdkjqilulkrmqrrgo.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_KEY || 'sb_publishable_lfHpd1y1gCaQIDXfRkD_8w_O1bPMWGx';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

app.use(cors());
app.use(express.json({ limit: '10mb' }));

const DATA_ID = '1';
const DATA_TABLE = 'app_data';

// ===== 工具函数 =====

async function loadData() {
  const { data, error } = await supabase
    .from(DATA_TABLE)
    .select('data')
    .eq('id', DATA_ID)
    .single();
  if (error || !data) return { submissions: [], nextId: 1, adminPassword: ADMIN_PASSWORD };
  return data.data || { submissions: [], nextId: 1, adminPassword: ADMIN_PASSWORD };
}

async function saveData(dataObj) {
  const { error } = await supabase
    .from(DATA_TABLE)
    .upsert({ id: DATA_ID, data: dataObj });
  return !error;
}

function nowStr() {
  const d = new Date();
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function generateOrderNumber() {
  const d = new Date();
  const Y = d.getFullYear();
  const M = String(d.getMonth() + 1).padStart(2, '0');
  const D = String(d.getDate()).padStart(2, '0');
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  const s = String(d.getSeconds()).padStart(2, '0');
  const rand = String(Math.floor(Math.random() * 100)).padStart(2, '0');
  return `${Y}${M}${D}${h}${m}${s}${rand}`;
}

// ===== 中间件：管理端鉴权 =====
function auth(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token || token !== ADMIN_PASSWORD) {
    return res.status(401).json({ ok: false, msg: '未登录或密码错误' });
  }
  next();
}

// ===== 公开接口 =====

// 提交寄样申请
app.post('/api/submit', async (req, res) => {
  try {
    const { business, talentName, name, phone, address, shipDate, isSF, description, items, product, quantity, itemSummary, repeatReason } = req.body;
    if (!name || !phone) {
      return res.status(400).json({ ok: false, msg: '请填写姓名和电话' });
    }

    const data = await loadData();
    const submission = {
      id: data.nextId++,
      orderNumber: generateOrderNumber(),
      business: (business || '').trim(),
      talentName: (talentName || '').trim(),
      name: name.trim(),
      phone: phone.trim(),
      address: (address || '').trim(),
      product: (product || '').trim(),
      quantity: (quantity || '').trim(),
      items: items || '',
      itemSummary: (itemSummary || '').trim(),
      isSF: isSF || '否',
      shipDate: (shipDate || '').trim(),
      repeatReason: (repeatReason || '').trim(),
      description: (description || '').trim(),
      status: 'pending',
      trackingCompany: '',
      trackingNumber: '',
      trackingTime: '',
      created_at: nowStr(),
      updated_at: nowStr(),
    };

    data.submissions.unshift(submission);
    await saveData(data);
    res.json({ ok: true, msg: '提交成功！', id: submission.id });
  } catch (e) {
    console.error('提交错误:', e);
    res.status(500).json({ ok: false, msg: '服务器错误' });
  }
});

// 用户查询快递
app.get('/api/tracking', async (req, res) => {
  try {
    const phone = (req.query.phone || '').trim();
    if (!phone) {
      return res.status(400).json({ ok: false, msg: '请提供手机号码' });
    }
    const data = await loadData();
    const rows = data.submissions
      .filter(s => s.phone === phone)
      .map(s => ({
        id: s.id, orderNumber: s.orderNumber, name: s.name,
        product: s.product, spec: s.spec, quantity: s.quantity,
        status: s.status, trackingCompany: s.trackingCompany || '',
        trackingNumber: s.trackingNumber || '',
        trackingTime: s.trackingTime || '',
        created_at: s.created_at, updated_at: s.updated_at,
      }));
    res.json({ ok: true, data: rows, total: rows.length });
  } catch (e) {
    res.status(500).json({ ok: false, msg: '服务器错误' });
  }
});

// 检查手机号是否重复
app.get('/api/check-phone', async (req, res) => {
  try {
    const phone = (req.query.phone || '').trim();
    if (!phone) return res.json({ ok: true, hasApproved: false });
    const data = await loadData();
    const hasApproved = data.submissions.some(s => s.phone === phone && s.status === 'approved');
    res.json({ ok: true, hasApproved });
  } catch (e) {
    res.json({ ok: true, hasApproved: false });
  }
});

// ===== 管理端接口 =====

// 登录
app.post('/api/admin/login', (req, res) => {
  const { password } = req.body;
  if (password !== ADMIN_PASSWORD) {
    return res.status(401).json({ ok: false, msg: '密码错误' });
  }
  res.json({ ok: true, token: ADMIN_PASSWORD, msg: '登录成功' });
});

// 获取统计数据
app.get('/api/admin/stats', auth, async (req, res) => {
  const data = await loadData();
  const subs = data.submissions;
  const pending = subs.filter(s => s.status === 'pending').length;
  const approved = subs.filter(s => s.status === 'approved' && (!s.trackingNumber || !s.trackingNumber.trim())).length;
  const rejected = subs.filter(s => s.status === 'rejected').length;
  const shipped = subs.filter(s => s.status === 'approved' && s.trackingNumber && s.trackingNumber.trim()).length;
  res.json({ ok: true, data: { total: subs.length, pending, approved, rejected, shipped } });
});

// 获取提交列表
app.get('/api/admin/submissions', auth, async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 20));
  const status = req.query.status || '';

  const data = await loadData();
  let filtered = data.submissions;
  if (status === 'shipped') {
    filtered = filtered.filter(s => s.status === 'approved' && s.trackingNumber && s.trackingNumber.trim());
  } else if (status === 'approved') {
    filtered = filtered.filter(s => s.status === 'approved' && (!s.trackingNumber || !s.trackingNumber.trim()));
  } else if (status && ['pending', 'rejected'].includes(status)) {
    filtered = filtered.filter(s => s.status === status);
  }

  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const offset = (page - 1) * limit;
  const rows = filtered.slice(offset, offset + limit);

  res.json({ ok: true, data: rows, total, page, totalPages });
});

// 审核
app.post('/api/admin/submissions/:id/review', auth, async (req, res) => {
  const { action } = req.body;
  if (!['approved', 'rejected'].includes(action)) {
    return res.status(400).json({ ok: false, msg: '无效操作' });
  }

  const id = parseInt(req.params.id);
  const data = await loadData();
  const row = data.submissions.find(s => s.id === id);
  if (!row) return res.status(404).json({ ok: false, msg: '未找到' });
  if (row.status !== 'pending') {
    return res.status(400).json({ ok: false, msg: `该申请已被${row.status === 'approved' ? '通过' : '拒绝'}` });
  }

  row.status = action;
  row.updated_at = nowStr();
  await saveData(data);
  res.json({ ok: true, msg: action === 'approved' ? '已通过' : '已拒绝' });
});

// 删除
app.delete('/api/admin/submissions/:id', auth, async (req, res) => {
  const id = parseInt(req.params.id);
  const data = await loadData();
  const index = data.submissions.findIndex(s => s.id === id);
  if (index === -1) return res.status(404).json({ ok: false, msg: '未找到' });

  data.submissions.splice(index, 1);
  await saveData(data);
  res.json({ ok: true, msg: '已删除' });
});

// 更新快递单号
app.post('/api/admin/submissions/:id/tracking', auth, async (req, res) => {
  const id = parseInt(req.params.id);
  const { trackingCompany, trackingNumber } = req.body;
  const data = await loadData();
  const row = data.submissions.find(s => s.id === id);
  if (!row) return res.status(404).json({ ok: false, msg: '未找到' });

  row.trackingCompany = trackingCompany || '';
  row.trackingNumber = trackingNumber || '';
  row.trackingTime = nowStr();
  row.updated_at = nowStr();
  await saveData(data);
  res.json({ ok: true, msg: '已更新' });
});

// CSV 批量回传
app.post('/api/admin/upload-tracking', auth, async (req, res) => {
  try {
    const { csv } = req.body; // 前端传解析好的数组
    if (!csv || !Array.isArray(csv) || csv.length < 2) {
      return res.status(400).json({ ok: false, msg: '数据格式错误' });
    }

    const data = await loadData();
    const results = { success: 0, fail: 0, errors: [] };
    const nowStrVal = nowStr();

    for (let i = 1; i < csv.length; i++) {
      const parts = csv[i];
      if (parts.length < 3) { results.fail++; results.errors.push(`第 ${i + 1} 行格式错误`); continue; }
      const orderNumber = parts[0].trim();
      const trackingCompany = parts[1].trim();
      const trackingNumber = parts.slice(2).join(',').trim();
      if (!orderNumber || !trackingNumber) { results.fail++; results.errors.push(`第 ${i + 1} 行数据不完整`); continue; }
      const submission = data.submissions.find(s => s.orderNumber === orderNumber);
      if (!submission) { results.fail++; results.errors.push(`订单号 ${orderNumber} 未找到`); continue; }
      submission.trackingCompany = trackingCompany;
      submission.trackingNumber = trackingNumber;
      submission.trackingTime = nowStrVal;
      submission.updated_at = nowStrVal;
      results.success++;
    }

    await saveData(data);
    res.json({ ok: true, msg: `上传完成：成功 ${results.success} 条，失败 ${results.fail} 条`, data: results });
  } catch (e) {
    res.status(500).json({ ok: false, msg: '服务器错误' });
  }
});

// ===== 启动 =====
app.listen(PORT, () => {
  console.log(`寄样管理 API 已启动 http://localhost:${PORT}`);
});
