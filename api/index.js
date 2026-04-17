require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(express.json({ limit: '10mb' }));
app.use(cors());

// Serve static files (frontend)
app.use(express.static(path.join(__dirname, '..')));

// Specific route for the home page
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'index.html'));
});

// --- Persistence Configuration ---
const MONGODB_URI = process.env.MONGODB_URI;
const LOCAL_STORAGE_PATH = path.join(__dirname, '..', 'signatures.json');

// --- MongoDB Schema ---
const ResolutionSchema = new mongoose.Schema({
    date: { type: String, default: '' },
    signatures: { type: Object, default: {} },
    shareholderData: { type: Array, default: [] },
    timestamp: { type: String, default: '' },
    submitted: { type: Boolean, default: false },
    lastUpdated: { type: Date, default: Date.now }
});
const Resolution = mongoose.models.Resolution || mongoose.model('Resolution', ResolutionSchema);

// --- MongoDB Connection (serverless-safe: reuse existing connection) ---
let isConnected = false;
const connectDB = async () => {
    if (isConnected && mongoose.connection.readyState === 1) return;
    if (!MONGODB_URI) return;
    try {
        await mongoose.connect(MONGODB_URI, {
            bufferCommands: false,
        });
        isConnected = true;
        console.log('Connected to MongoDB.');
    } catch (err) {
        isConnected = false;
        console.error('MongoDB connection failed:', err.message);
        throw err;
    }
};

// --- Storage Logic ---
const loadData = async () => {
    if (MONGODB_URI) {
        await connectDB();
        let data = await Resolution.findOne().lean();
        if (!data) {
            data = await Resolution.create({ signatures: {}, submitted: false });
            data = data.toObject();
        }
        return data;
    } else {
        // Local file fallback (only works in non-serverless environments)
        if (fs.existsSync(LOCAL_STORAGE_PATH)) {
            const raw = fs.readFileSync(LOCAL_STORAGE_PATH, 'utf-8');
            return JSON.parse(raw);
        }
        return { signatures: {}, submitted: false };
    }
};

const saveData = async (update) => {
    if (MONGODB_URI) {
        await connectDB();
        let data = await Resolution.findOne();
        if (!data) data = new Resolution({ signatures: {}, submitted: false });
        Object.assign(data, update);
        data.lastUpdated = new Date();
        data.markModified('signatures');
        await data.save();
    } else {
        // Local file fallback
        let current = { signatures: {}, submitted: false };
        if (fs.existsSync(LOCAL_STORAGE_PATH)) {
            const raw = fs.readFileSync(LOCAL_STORAGE_PATH, 'utf-8');
            current = JSON.parse(raw);
        }
        Object.assign(current, update);
        current.lastUpdated = new Date();
        fs.writeFileSync(LOCAL_STORAGE_PATH, JSON.stringify(current, null, 2));
    }
};

// --- API Endpoints ---
app.get('/api/data', async (req, res) => {
    try {
        const data = await loadData();
        res.json(data);
    } catch (err) {
        console.error('Error loading data:', err);
        res.status(500).json({ error: err.message });
    }
});

// API to fetch latest signatures (for page load)
app.get('/api/signatures/latest', async (req, res) => {
    try {
        const data = await loadData();
        res.json({ success: true, data: { signatures: data.signatures || {}, submitted: data.submitted || false } });
    } catch (err) {
        console.error('Error loading signatures:', err);
        res.status(500).json({ error: err.message });
    }
});

// API to save an individual signature
app.post('/api/save-signature', async (req, res) => {
    const { index, signature } = req.body;
    if (index === undefined) {
        return res.status(400).json({ error: 'Missing index' });
    }
    try {
        const data = await loadData();
        const signatures = data.signatures || {};
        if (signature) {
            signatures[index.toString()] = signature;
            console.log(`Saving signature for index ${index}`);
        } else {
            delete signatures[index.toString()];
            console.log(`Deleting signature for index ${index}`);
        }
        await saveData({ signatures, submitted: false });
        res.json({ success: true, signatures });
    } catch (err) {
        console.error('Error saving signature:', err);
        res.status(500).json({ error: err.message });
    }
});

// API to save all signatures (bulk save from frontend)
app.post('/api/signatures', async (req, res) => {
    const { signatures, date, shareholderData, timestamp } = req.body;
    if (!signatures) {
        return res.status(400).json({ error: 'Missing signatures' });
    }
    try {
        await saveData({ signatures, date, shareholderData, timestamp, submitted: true });
        console.log(`All signatures saved on ${date}`);
        res.json({ success: true, storedInMongo: !!MONGODB_URI, signatures });
    } catch (err) {
        console.error('Error saving signatures:', err);
        res.status(500).json({ error: err.message });
    }
});

// API to finalize/submit the resolution
app.post('/api/submit', async (req, res) => {
    try {
        await saveData({ submitted: true });
        console.log('Resolution finalized');
        res.json({ success: true });
    } catch (err) {
        console.error('Error finalizing resolution:', err);
        res.status(500).json({ error: err.message });
    }
});

// API to reset all signatures
app.post('/api/reset', async (req, res) => {
    try {
        if (MONGODB_URI) {
            await connectDB();
            await Resolution.deleteMany({});
        } else {
            const reset = { signatures: {}, submitted: false, lastUpdated: new Date() };
            fs.writeFileSync(LOCAL_STORAGE_PATH, JSON.stringify(reset, null, 2));
        }
        res.json({ success: true });
    } catch (err) {
        console.error('Error resetting:', err);
        res.status(500).json({ error: err.message });
    }
});

// --- Startup (only for local dev, not Vercel) ---
if (process.env.NODE_ENV !== 'production') {
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => {
        console.log(`Server running on http://localhost:${PORT}`);
        if (!MONGODB_URI) {
            console.log(`No MONGODB_URI set. Using local file: ${LOCAL_STORAGE_PATH}`);
        }
    });
}

module.exports = app;
