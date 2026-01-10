const express = require('express');
const metroService = require('./metroService');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static('public'));
app.use(express.json());

// Initialize the service (fetch stations and token)
metroService.initialize();

app.get('/api/stations', (req, res) => {
    const query = req.query.q || '';
    const results = metroService.findStations(query);
    res.json(results);
});

app.get('/api/schedule', async (req, res) => {
    const { origin, destination } = req.query;
    if (!origin || !destination) {
        return res.status(400).json({ error: 'Origin and destination are required' });
    }

    try {
        const schedule = await metroService.getSchedule(origin, destination);
        res.json(schedule);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
