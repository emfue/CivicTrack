const router = require('express').Router();
const multer = require('multer');
const c = require('../controllers/complaints');
const { requireAuth } = require('../middleware/auth');
const { asyncRoute } = require('../utils/http');
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: Number(process.env.MAX_UPLOAD_SIZE_BYTES) || 5242880, files: 3, fields: 12 } });
router.use(requireAuth); router.get('/stats', asyncRoute(c.stats)); router.get('/', asyncRoute(c.list)); router.post('/', upload.array('photos', 3), asyncRoute(c.create)); router.get('/:id', asyncRoute(c.detail)); router.get('/:id/status-history', asyncRoute(c.history)); router.get('/:id/photos/:photoId', asyncRoute(c.photo)); router.delete('/:id', asyncRoute(c.remove));
module.exports = router;
