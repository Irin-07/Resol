const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

const app = express();
app.use(express.json({ limit: '10mb' }));
app.use(cors());

// MongoDB Schema
const ResolutionSchema = new mongoose.Schema({
    signatures: { type: Object, default: {} },
    submitted: { type: Boolean, default: false },
    lastUpdated: { type: Date, default: Date.now }
});

const Resolution = mongoose.models.Resolution || mongoose.model('Resolution', ResolutionSchema);

// Connect to MongoDB
const connectDB = async () => {
    if (mongoose.connection.readyState >= 1) return;
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log("Connected to MongoDB");
    } catch (err) {
        console.error("MongoDB connection error:", err);
    }
};

// API Endpoints
app.get('/api/data', async (req, res) => {
    await connectDB();
    try {
        let data = await Resolution.findOne();
        if (!data) {
            data = await Resolution.create({ signatures: {}, submitted: false });
        }
        res.json(data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/save-signature', async (req, res) => {
    await connectDB();
    const { index, signature } = req.body;
    try {
        let data = await Resolution.findOne();
        if (!data) data = new Resolution();
        
        data.signatures[index] = signature;
        data.markModified('signatures');
        data.lastUpdated = new Date();
        await data.save();
        
        res.json({ success: true, signatures: data.signatures });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/submit', async (req, res) => {
    await connectDB();
    try {
        let data = await Resolution.findOne();
        if (!data) data = new Resolution();
        
        data.submitted = true;
        data.lastUpdated = new Date();
        await data.save();
        
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// For Vercel Serverless
module.exports = app;
