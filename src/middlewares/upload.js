import multer from "multer";
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 12 * 1024 * 1024, files: 1 },
});

export { upload };

// Guías de varias hojas; los demás endpoints conservan un solo archivo.
export const uploadDocuments=multer({storage:multer.memoryStorage(),limits:{fileSize:12*1024*1024,files:10,fields:30,fieldSize:1024*1024}});
