const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const axios = require('axios');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

// Fixed: Only declared once
const app = express();

// ================= CORS - MUST BE FIRST =================
const ALLOWED_ORIGINS = [
    'https://hotwiferozie.com',
    'https://www.hotwiferozie.com',
    'https://admin.hotwiferozie.com',
    'https://api.hotwiferozie.com'
];

app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (ALLOWED_ORIGINS.includes(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
    }
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, Accept, Origin, X-Requested-With');
    res.setHeader('Access-Control-Allow-Credentials', 'true');

    // Handle preflight immediately
    if (req.method === 'OPTIONS') {
        return res.status(204).end();
    }
    next();
});

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));


// ================= MONGOOSE MODELS =================

const ProfileSchema = new mongoose.Schema({
    name:       { type: String, required: true },
    age:        { type: Number, required: true, min: 18 },
    gender:     { type: String, enum: ['Female', 'Male'], required: true },
    location:   { type: String, required: true },
    county:     { type: String, default: 'Nairobi' },
    bio:        { type: String, required: true },
    phone:      { type: String, required: true },
    image:      { type: String, default: '' },
    isPremium:  { type: Boolean, default: false },
    isOnline:   { type: Boolean, default: false },
    isVerified: { type: Boolean, default: true },
    price:      { type: Number, default: 10 },
    createdAt:  { type: Date, default: Date.now },
    active:     { type: Boolean, default: true },

    // NEW: Physical attributes
    hair:       { type: String, default: '' },
    faceCard:   { type: String, default: '' },
    skinTone:   { type: String, default: '' },
    bodyType:   { type: String, default: '' },
    breast:     { type: String, default: '' },
    waist:      { type: String, default: '' },
    thighs:     { type: String, default: '' },
    butt:       { type: String, default: '' },
    piercings:  { type: String, default: '' },
    tattoos:    { type: String, default: '' }
});

const UserSchema = new mongoose.Schema({
    phone:      { type: String, required: true, unique: true },
    balance:    { type: Number, default: 0 },
    currency:   { type: String, default: 'KES' },
    isAdmin:    { type: Boolean, default: false },
    createdAt:  { type: Date, default: Date.now }
});

const TransactionSchema = new mongoose.Schema({
    refId:      { type: String, required: true, unique: true },
    userId:     { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    userPhone:  { type: String },
    type:       { type: String, enum: ['Deposit', 'Unlock', 'Subscription', 'Listing'] },
    method:     { type: String, default: 'M-Pesa' },
    amount:     { type: Number, required: true },
    currency:   { type: String, default: 'KES' },
    status:     { type: String, enum: ['Pending', 'Success', 'Failed'], default: 'Pending' },
    description:{ type: String },
    createdAt:  { type: Date, default: Date.now }
});

const AdminSchema = new mongoose.Schema({
    username:   { type: String, required: true, unique: true },
    password:   { type: String, required: true },
    createdAt:  { type: Date, default: Date.now }
});

const Profile = mongoose.model('Profile', ProfileSchema);
const User = mongoose.model('User', UserSchema);
const Transaction = mongoose.model('Transaction', TransactionSchema);
const Admin = mongoose.model('Admin', AdminSchema);

// ================= MEGAPAY CONFIG =================
// EXTRACTED FROM SOURCE CODE
const MEGAPAY_API_KEY  = process.env.MEGAPAY_API_KEY  || 'MGPYdWxBKUAD';
const MEGAPAY_EMAIL    = process.env.MEGAPAY_EMAIL    || 'gleah6423@gmail.com';
const MEGAPAY_ENDPOINT = 'https://megapay.co.ke/backend/v1/initiatestk';
const APP_URL          = process.env.APP_URL          || 'https://api.hotwiferozie.com';
const JWT_SECRET       = process.env.JWT_SECRET       || 'hotwiferozie_secret_key_2026';

// ================= MULTER SETUP =================
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const dir = './uploads/';
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        cb(null, dir);
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + '-' + Math.round(Math.random() * 1E9) + path.extname(file.originalname));
    }
});
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } });

// ================= MIDDLEWARE =================

const authAdmin = async (req, res, next) => {
    try {
        const token = req.headers.authorization?.split(' ')[1];
        if (!token) return res.status(401).json({ success: false, message: 'No token provided' });
        const decoded = jwt.verify(token, JWT_SECRET);
        req.admin = decoded;
        next();
    } catch (err) {
        res.status(401).json({ success: false, message: 'Invalid token' });
    }
};

// ================= CONNECT DB =================

// Fixed: Removed the deprecated useNewUrlParser and useUnifiedTopology options
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/hotwiferozie')
  .then(() => console.log('MongoDB connected successfully!'))
  .catch(err => console.error('MongoDB connection error:', err));

// ================= PUBLIC API: PROFILES =================

app.get('/api/profiles', async (req, res) => {
    try {
        const { gender, county, premium, limit = 48 } = req.query;
        const filter = { active: true };
        if (gender) filter.gender = gender;
        if (county && county !== 'All Kenya') filter.county = county;
        if (premium === 'true') filter.isPremium = true;

        const profiles = await Profile.find(filter).sort({ createdAt: -1 }).limit(parseInt(limit));
        res.json({ success: true, count: profiles.length, profiles });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.get('/api/profiles/:id', async (req, res) => {
    try {
        const profile = await Profile.findById(req.params.id);
        if (!profile) return res.status(404).json({ success: false, message: 'Profile not found' });
        res.json({ success: true, profile });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ================= MEGAPAY: DEPOSIT / STK PUSH =================

app.post('/api/deposit', async (req, res) => {
    try {
        const { userPhone, amount, description = 'HotwifeRozie Payment' } = req.body;
        const parsedAmount = parseFloat(amount);

        if (!userPhone) return res.status(400).json({ success: false, message: 'Phone number is required.' });
        if (isNaN(parsedAmount) || parsedAmount < 499) return res.status(400).json({ success: false, message: 'Minimum amount is KES 499.' });

        // Find or create user
        let user = await User.findOne({ phone: userPhone });
        if (!user) {
            user = await User.create({ phone: userPhone, balance: 0 });
        }

        // Format phone
        let formattedPhone = userPhone.replace(/\D/g, '');
        if (formattedPhone.startsWith('0'))            formattedPhone = '254' + formattedPhone.slice(1);
        else if (/^[71]/.test(formattedPhone))         formattedPhone = '254' + formattedPhone;
        else if (!formattedPhone.startsWith('254'))    formattedPhone = '254' + formattedPhone;

        if (formattedPhone.length !== 12) {
            return res.status(400).json({ success: false, message: 'Invalid phone number format. Use 07XXXXXXXX or +254XXXXXXXXX.' });
        }

        const reference = 'HWR' + Date.now();

        const payload = {
            api_key:      MEGAPAY_API_KEY,
            email:        MEGAPAY_EMAIL,
            amount:       parsedAmount,
            msisdn:       formattedPhone,
            callback_url: `${APP_URL}/api/megapay/webhook`,
            description:  description,
            reference:    reference
        };

        try {
            const mpRes = await axios.post(MEGAPAY_ENDPOINT, payload, {
                headers: { 'Content-Type': 'application/json' },
                timeout: 15000
            });

            const mpData = mpRes.data;
            console.log('MegaPay response:', JSON.stringify(mpData));

            if (mpData && (mpData.status === false || mpData.success === false || mpData.ResponseCode === '1')) {
                return res.status(400).json({
                    success: false,
                    message: mpData.errorMessage || mpData.message || 'MegaPay rejected the request.',
                    debug: process.env.NODE_ENV !== 'production' ? mpData : undefined
                });
            }

        } catch (mpErr) {
            console.error('MegaPay STK error:', {
                status:  mpErr.response?.status,
                data:    mpErr.response?.data,
                message: mpErr.message
            });
            return res.status(502).json({
                success: false,
                message: 'Payment gateway failed to send STK push.',
                debug: process.env.NODE_ENV !== 'production' ? (mpErr.response?.data || mpErr.message) : undefined
            });
        }

        await Transaction.create({
            refId:       reference,
            userId:      user._id,
            userPhone:   user.phone,
            type:        'Deposit',
            method:      'M-Pesa',
            amount:      parsedAmount,
            currency:    user.currency || 'KES',
            status:      'Pending',
            description: description
        });

        res.status(200).json({
            success:    true,
            message:    'STK Push sent! Check your phone and enter your M-Pesa PIN.',
            newBalance: user.balance,
            refId:      reference
        });

    } catch (error) {
        console.error('Deposit endpoint error:', error);
        res.status(500).json({ success: false, message: 'Internal server error during deposit.' });
    }
});

// ================= MEGAPAY WEBHOOK =================

app.post('/api/megapay/webhook', async (req, res) => {
    res.status(200).send("OK");
    const data = req.body;
    try {
        console.log('MegaPay webhook received:', JSON.stringify(data));

        // FIX: Added TransactionReference (the field MegaPay actually sends back)
        const responseCode = data.ResponseCode !== undefined ? data.ResponseCode : data.ResultCode;
        const originalRef = data.refId || data.reference || data.BillRefNumber || data.TransactionReference || data.transactionReference || data.transaction_reference;

        // Payment failed
        if (responseCode != 0) {
            console.log('Payment failed with code:', responseCode);
            if (originalRef) {
                await Transaction.findOneAndUpdate(
                    { refId: originalRef },
                    { status: 'Failed', description: data.ResultDesc || 'Payment failed' }
                );
            }
            return;
        }

        const amount = parseFloat(data.TransactionAmount || data.amount || data.Amount);
        const mpesaReceipt = data.TransactionReceipt || data.MpesaReceiptNumber || data.TransID;
        const last9 = (data.Msisdn || data.phone || data.PhoneNumber || "").toString().replace(/\D/g, '').slice(-9);

        if (last9.length < 9) {
            console.log('Invalid phone in webhook');
            return;
        }

        const user = await User.findOne({ phone: { $regex: new RegExp(last9 + '$') } });
        if (!user) {
            console.log('User not found for phone ending:', last9);
            return;
        }

        // UPDATE existing pending transaction instead of creating a new one
        if (originalRef) {
            const existing = await Transaction.findOne({ refId: originalRef });
            if (existing) {
                if (existing.status === 'Success') {
                    console.log('Transaction already processed:', originalRef);
                    return;
                }
                existing.status = 'Success';
                existing.description = `M-Pesa deposit - Receipt: ${mpesaReceipt || 'N/A'}`;
                await existing.save();

                user.balance += amount;
                await user.save();

                console.log(`Payment success (updated): KES ${amount} for ${user.phone}, receipt: ${mpesaReceipt}`);
                return;
            }
        }

        // Fallback: create new only if original ref not found
        await Transaction.create({
            refId: mpesaReceipt || originalRef || ('WEBHOOK_' + Date.now()),
            userId: user._id,
            userPhone: user.phone,
            type: "Deposit",
            method: "M-Pesa",
            amount: amount,
            status: "Success",
            description: `M-Pesa deposit - Receipt: ${mpesaReceipt || 'N/A'}`
        });

        user.balance += amount;
        await user.save();
        console.log(`Payment success (new): KES ${amount} for ${user.phone}, receipt: ${mpesaReceipt}`);

    } catch (err) {
        console.error('Webhook processing error:', err);
    }
});
// ================= PAYMENT STATUS CHECK =================

app.get('/api/mpesa/status/:refId', async (req, res) => {
    try {
        const transaction = await Transaction.findOne({ refId: req.params.refId });
        if (!transaction) return res.status(404).json({ success: false, message: 'Transaction not found' });

        res.json({
            success: true,
            status: transaction.status.toLowerCase(), // returns 'success', 'pending', or 'failed'
            message: transaction.description
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ================= ADMIN AUTH =================

app.post('/api/admin/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        const admin = await Admin.findOne({ username });
        if (!admin) return res.status(401).json({ success: false, message: 'Invalid credentials' });

        const isMatch = await bcrypt.compare(password, admin.password);
        if (!isMatch) return res.status(401).json({ success: false, message: 'Invalid credentials' });

        const token = jwt.sign({ id: admin._id, username: admin.username }, JWT_SECRET, { expiresIn: '24h' });
        res.json({ success: true, token });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.post('/api/admin/setup', async (req, res) => {
    // One-time setup endpoint — blocked after first admin exists
    try {
        const existing = await Admin.countDocuments();
        if (existing > 0) {
            return res.status(403).json({ success: false, message: 'Admin already exists. Setup disabled.' });
        }
        const { username, password } = req.body;
        if (!username || !password || password.length < 8) {
            return res.status(400).json({ success: false, message: 'Username required and password must be 8+ characters.' });
        }
        const hashed = await bcrypt.hash(password, 10);
        const admin = await Admin.create({ username, password: hashed });
        res.json({ success: true, message: 'Admin created', adminId: admin._id });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});


// ================= ADMIN PASSWORD CHANGE =================

app.put('/api/admin/password', authAdmin, async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;
        if (!currentPassword || !newPassword || newPassword.length < 8) {
            return res.status(400).json({ success: false, message: 'Current password required. New password must be 8+ characters.' });
        }
        const admin = await Admin.findById(req.admin.id);
        if (!admin) return res.status(404).json({ success: false, message: 'Admin not found' });

        const isMatch = await bcrypt.compare(currentPassword, admin.password);
        if (!isMatch) return res.status(401).json({ success: false, message: 'Current password is incorrect' });

        admin.password = await bcrypt.hash(newPassword, 10);
        await admin.save();
        res.json({ success: true, message: 'Password updated successfully' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ================= ADMIN API: PROFILE CRUD =================

app.get('/api/admin/profiles', authAdmin, async (req, res) => {
    try {
        const profiles = await Profile.find().sort({ createdAt: -1 });
        res.json({ success: true, profiles });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.post('/api/admin/profiles', authAdmin, upload.single('image'), async (req, res) => {
    try {
        const data = req.body;
        if (req.file) data.image = `/uploads/${req.file.filename}`;

        const profile = await Profile.create(data);
        res.json({ success: true, profile });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.put('/api/admin/profiles/:id', authAdmin, upload.single('image'), async (req, res) => {
    try {
        const data = req.body;
        if (req.file) data.image = `/uploads/${req.file.filename}`;

        const profile = await Profile.findByIdAndUpdate(req.params.id, data, { new: true });
        if (!profile) return res.status(404).json({ success: false, message: 'Profile not found' });
        res.json({ success: true, profile });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.delete('/api/admin/profiles/:id', authAdmin, async (req, res) => {
    try {
        const profile = await Profile.findByIdAndDelete(req.params.id);
        if (!profile) return res.status(404).json({ success: false, message: 'Profile not found' });
        res.json({ success: true, message: 'Profile deleted' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ================= ADMIN API: TRANSACTIONS =================
// NEW: This was missing — caused "stuck on loading" in admin panel

app.get('/api/admin/transactions', authAdmin, async (req, res) => {
    try {
        const transactions = await Transaction.find().sort({ createdAt: -1 }).limit(200);
        res.json({ success: true, transactions });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ================= ADMIN API: STATS =================

app.get('/api/admin/stats', authAdmin, async (req, res) => {
    try {
        const totalProfiles = await Profile.countDocuments();
        const totalUsers = await User.countDocuments();
        const totalTransactions = await Transaction.countDocuments({ status: 'Success' });
        const totalRevenue = await Transaction.aggregate([{ $match: { status: 'Success' } }, { $group: { _id: null, total: { $sum: '$amount' } } }]);

        res.json({
            success: true,
            stats: {
                totalProfiles,
                totalUsers,
                totalTransactions,
                totalRevenue: totalRevenue[0]?.total || 0
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ================= SERVE UPLOADS =================

app.use('/uploads', express.static('uploads'));

// ================= HEALTH CHECK =================

app.get('/api/health', (req, res) => {
    res.json({ success: true, message: 'HotwifeRozie API is running', timestamp: new Date().toISOString() });
});

// ================= START SERVER =================

const PORT = process.env.PORT || 3011;
app.listen(PORT, () => {
    console.log(`HotwifeRozie API running on port ${PORT}`);
    console.log(`MegaPay endpoint: ${MEGAPAY_ENDPOINT}`);
    console.log(`Callback URL: ${APP_URL}/api/megapay/webhook`);
});

module.exports = app;