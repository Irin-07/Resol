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
let isUsingMongoDB = false;

// Shared data structure
let localData = { signatures: {}, submitted: false };

// --- Storage Logic ---
const loadData = async () => {
    if (isUsingMongoDB) {
        let data = await Resolution.findOne();
        if (!data) data = await Resolution.create({ signatures: {}, submitted: false });
        return data;
    } else {
        if (fs.existsSync(LOCAL_STORAGE_PATH)) {
            const raw = fs.readFileSync(LOCAL_STORAGE_PATH);
            localData = JSON.parse(raw);
        }
        return localData;
    }
};

const saveData = async (update) => {
    if (isUsingMongoDB) {
        let data = await Resolution.findOne();
        if (!data) data = new Resolution();
        Object.assign(data, update);
        data.markModified('signatures');
        await data.save();
    } else {
        Object.assign(localData, update);
        fs.writeFileSync(LOCAL_STORAGE_PATH, JSON.stringify(localData, null, 2));
    }
};

// --- MongoDB Setup ---
const ResolutionSchema = new mongoose.Schema({
    signatures: { type: Object, default: {} },
    submitted: { type: Boolean, default: false },
    lastUpdated: { type: Date, default: Date.now }
});
const Resolution = mongoose.models.Resolution || mongoose.model('Resolution', ResolutionSchema);

const connectDB = async () => {
    if (isUsingMongoDB || !MONGODB_URI) return;
    try {
        await mongoose.connect(MONGODB_URI);
        isUsingMongoDB = true;
    } catch (err) {
        console.error("MongoDB failed, staying on local storage.");
    }
};

// --- API Endpoints ---
app.get('/api/data', async (req, res) => {
    try {
        const data = await loadData();
        res.json(data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});
app.post('/api/save-signature', async (req, res) => {
    const { index, signature } = req.body;
    try {
        const data = await loadData();
        if (data.submitted) {
            return res.status(403).json({ error: "Resolution is finalized. No more signatures can be added." });
        }
        const signatures = data.signatures || {};
        signatures[index] = signature;
        await saveData({ signatures });
        res.json({ success: true, signatures });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});
app.post('/api/save-signature', async (req, res) => {
    const { index, signature } = req.body;
    try {
        const data = await loadData();
        const signatures = data.signatures || {};
        signatures[index] = signature;
        // submitted: false — always allow signing
        await saveData({ signatures, submitted: false });
        res.json({ success: true, signatures });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});
app.post('/api/reset', async (req, res) => {
    try {
        if (isUsingMongoDB) {
            await Resolution.deleteMany({});
        } else {
            localData = { signatures: {}, submitted: false };
            fs.writeFileSync(LOCAL_STORAGE_PATH, JSON.stringify(localData, null, 2));
        }
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- Startup ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
    console.log(`Server running on http://localhost:${PORT}`);
    
    if (MONGODB_URI) {
        await connectDB();
        if (isUsingMongoDB) {
            console.log("Connected to MongoDB.");
        }
    } else {
        const sigDir = path.join('C:', 'Resolution', 'signatures');
        console.log(`Using signatures directory: ${sigDir}`);
        console.log("MongoDB URI not configured. Using local file storage only.");
    }
});

module.exports = app;
