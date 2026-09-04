import { createClient } from '@supabase/supabase-js';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import formidable from 'formidable';
import fs from 'fs';

export const config = {
  api: {
    bodyParser: false,
  },
};

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const r2 = new S3Client({
  region: 'auto',
  endpoint: process.env.CLOUDFLARE_R2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.CLOUDFLARE_R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY,
  },
});

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const form = formidable({ multiples: false });

  form.parse(req, async (err, fields, files) => {
    if (err) {
      return res.status(500).json({ error: 'فشل في قراءة بيانات النموذج' });
    }

    try {
      const getField = (val) => Array.isArray(val) ? val[0] : val;

      const full_name = getField(fields.full_name);
      const nationality = getField(fields.nationality);
      const job_title = getField(fields.job_title);
      const university_name = getField(fields.university_name);
      const medical_license = getField(fields.medical_license);
      const experience_years = getField(fields.experience_years);
      const passport_status = getField(fields.passport_status);
      const email = getField(fields.email);
      const whatsapp = getField(fields.whatsapp);
      const exam_location = getField(fields.exam_location);

      const uploadFileToR2 = async (fileObj, prefix) => {
        const file = Array.isArray(fileObj) ? fileObj[0] : fileObj;
        if (!file) throw new Error('الملف مفقود');
        
        const fileContent = fs.readFileSync(file.filepath);
        const fileName = `${prefix}-${Date.now()}-${file.originalFilename || 'file.pdf'}`;

        await r2.send(new PutObjectCommand({
          Bucket: process.env.CLOUDFLARE_R2_BUCKET_NAME,
          Key: fileName,
          Body: fileContent,
          ContentType: 'application/pdf',
        }));

        return `${process.env.CLOUDFLARE_R2_PUBLIC_URL}/${fileName}`;
      };

      const degreeFileUrl = await uploadFileToR2(files.degree_file, 'degree');
      const cvFileUrl = await uploadFileToR2(files.cv_file, 'cv');

      const { data, error: dbError } = await supabase
        .from('job_applications')
        .insert([
          {
            full_name,
            nationality,
            job_title,
            university_name,
            medical_license,
            experience_years,
            passport_status,
            email,
            whatsapp,
            exam_location,
            degree_file_url: degreeFileUrl,
            cv_file_url: cvFileUrl,
          }
        ]);

      if (dbError) throw dbError;

      return res.status(200).json({ success: true, message: 'تم إرسال الطلب بنجاح' });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: error.message || 'حدث خطأ أثناء معالجة الطلب' });
    }
  });
}
