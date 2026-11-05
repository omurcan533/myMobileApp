// Technical exports only: preserve the generated character, normalize stray alpha,
// resize to platform canvases and export the same silhouette as an alpha-only mask.
import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
const require=createRequire(import.meta.url);
const imageRequire=createRequire(require.resolve('@expo/image-utils'));
const Jimp=imageRequire('jimp-compact');
const {PNG}=imageRequire('pngjs');
const dir='assets/brand';await mkdir(dir,{recursive:true});
const source=await Jimp.read(`${dir}/mascot-source-v1.png`);
let left=source.bitmap.width,top=source.bitmap.height,right=0,bottom=0;
source.scan(0,0,source.bitmap.width,source.bitmap.height,function(x,y,i){
 if(this.bitmap.data[i+3]<=8)this.bitmap.data[i+3]=0;
 else{left=Math.min(left,x);top=Math.min(top,y);right=Math.max(right,x);bottom=Math.max(bottom,y);}
});
if(right<=left||bottom<=top)throw Error('Transparent source has no visible character');
const mark=source.clone().crop(left,top,right-left+1,bottom-top+1);
const square=(size,color=0x00000000)=>new Jimp(size,size,color);
const fit=(im,width,height)=>im.clone().scaleToFit(width,height,Jimp.RESIZE_BICUBIC);
const center=(canvas,im)=>canvas.composite(im,Math.floor((canvas.bitmap.width-im.bitmap.width)/2),Math.floor((canvas.bitmap.height-im.bitmap.height)/2));
const save=async(im,name,opaque=false)=>{
 const bytes=PNG.sync.write(im.bitmap,{colorType:opaque?2:6,inputColorType:6,inputHasAlpha:true});
 const decoded=PNG.sync.read(bytes);
 if(decoded.width!==im.bitmap.width||decoded.height!==im.bitmap.height||!decoded.data.equals(im.bitmap.data))throw Error(`PNG round-trip failed: ${name}`);
 if(opaque&&bytes[25]!==2)throw Error(`RGB icon required: ${name}`);
 await writeFile(`${dir}/${name}`,bytes);
};
const logo=center(square(1024),fit(mark,840,840));
await save(logo,'mascot-mark-v1.png');
const icon=center(square(1024,0x050a14ff),fit(mark,840,840));
icon.scan(0,0,1024,1024,function(x,y,i){this.bitmap.data[i+3]=255;});
await save(icon,'app-icon-v1.png',true);
await save(icon.clone().resize(64,64,Jimp.RESIZE_BICUBIC),'favicon-v1.png',true);
let radius=0;mark.scan(0,0,mark.bitmap.width,mark.bitmap.height,function(x,y,i){if(this.bitmap.data[i+3])radius=Math.max(radius,Math.hypot(x-(mark.bitmap.width-1)/2,y-(mark.bitmap.height-1)/2));});
const scale=300/radius;const adaptive=mark.clone().resize(Math.round(mark.bitmap.width*scale),Math.round(mark.bitmap.height*scale),Jimp.RESIZE_BICUBIC);
const foreground=center(square(1024),adaptive);
await save(foreground,'android-foreground-v1.png');
const mono=foreground.clone();mono.scan(0,0,1024,1024,function(x,y,i){this.bitmap.data[i]=255;this.bitmap.data[i+1]=255;this.bitmap.data[i+2]=255;});
await save(mono,'android-monochrome-v1.png');
// Required export properties, checked before this script reports success.
let escaped=0,transparentIcon=0;
foreground.scan(0,0,1024,1024,function(x,y,i){if(this.bitmap.data[i+3]&&Math.hypot(x-511.5,y-511.5)>1024*66/108/2)escaped++;});
icon.scan(0,0,1024,1024,function(x,y,i){if(this.bitmap.data[i+3]!==255)transparentIcon++;});
if(escaped||transparentIcon)throw Error(`Invalid export: unsafe foreground=${escaped}, nonopaque iOS=${transparentIcon}`);
await writeFile(`${dir}/export-info.json`,JSON.stringify({version:1,source:'mascot-source-v1.png',canvas:1024,background:'#050A14',androidSafeRadius:300,iosOpaque:true,monochrome:'white silhouette with source alpha'},null,2)+'\n');
console.log('Exported: opaque 1024px iOS/legacy icon, transparent splash mark, adaptive foreground, monochrome alpha mask, 64px favicon.');
