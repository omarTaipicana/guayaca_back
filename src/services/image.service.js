import sharp from 'sharp';
export async function optimizeImage(buffer){
 const input=sharp(buffer,{limitInputPixels:40000000});const meta=await input.metadata();
 if(!['jpeg','png','webp'].includes(meta.format))throw Error('Formato de imagen no admitido');
 let output=await input.rotate().resize({width:2000,height:2000,fit:'inside',withoutEnlargement:true}).flatten({background:'#fff'}).jpeg({quality:78,mozjpeg:true}).toBuffer();
 // Preserve document readability: reduce quality only to 64, never below.
 if(output.length>700*1024)output=await sharp(output).jpeg({quality:64,mozjpeg:true}).toBuffer();
 return output;
}
