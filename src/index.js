/*********************************************************
 * Image inliner / optimizer
 * Module was written for embedded systems: thus minimal files to serve, and shrink sizes as much as possible
 * 
 * Written by Filipe Laborde - fil@rezox.com
 * 
 * MIT license - free to use as you wish, but no guarantees given.
 * *******************************************************/
import { optimize } from 'svgo';
import { readFileSync, existsSync, statSync } from 'fs';
import { resolve } from 'path';
import sharp from 'sharp';

export default function inlineImageOptimizerPlugin(options = {}){
    const { fileTypes, searchPath, inlineSize, resizeEnable, quality }=
    // defaults
    {   fileTypes: ['html', 'js'],
        searchPath: './',
        inlineSize: 3072,
        resizeEnable: false,
        quality: 70, 
        ...options };
    let resizeDir, assetsDir;
console.log( ` ... resizeEnable(${resizeEnable})`)
  return {
    name: 'vite-plugin-image-inline-optimizer',
    async transform(code, id) {
        const idType = id.split('.').pop().split('?')[0];
        // console.log( `fileTypes(${fileTypes.join(',')}, idType(${idType}))`)
        if (fileTypes.includes(idType)) { // }.endsWith('.svelte') || id.endsWith('.js') || id.endsWith('.html')) {
            // find all <img tags
            const imgRegex = /<img([^>]*)\s+src=(["'])([^"']+)\2([^>]*)\/?>/g;
            let match;
            while ((match = imgRegex.exec(code))) {
                // parse img
                const imgName = match[3].split('/').pop() || match[3];
                const ext = imgName.split('.').pop();
                if( match[3].includes('{')){
                    console.log(` --X image ${imgName} not static, skipping.`)
                    continue; // don't allow variable names for changes
                } 
                let srcPath = match[3].replace(imgName,'');
                let file;
                // console.log( `**** img resolving: ${srcPath}|${imgName}`);
                try {
                    let isFound = false;
                    for (let _path of [srcPath,...searchPath]) {
                        if( _path[0]=='/' ){ _path = _path.substring(1); }; //console.log( `WARNING: path(${srcPath}) was absolute, removed starting /.`); }
                        file = resolve(_path, imgName);
                        if (existsSync(file)) {
                            srcPath = _path;
                            // console.log( ` resolved path: ${srcPath}` );
                            isFound = true; 
                            break;
                        }
                    }
                    if( !isFound ){
                        console.log(` --X image ${imgName} not found, skipping.`)
                        continue;
                    } 
                } catch (error) {
                    console.error(`[vite-plugin-inline-assets] Error processing file: ${file} (skipping)`, error);
                    continue;
                }

                const len = match[4].length;
                const attributes = match[1] + ' ' + (match[4][len-1]=='/' ? match[4].substring(0,len-1) : match[4]);

                // console.log( `\n\n ... srcPath(${srcPath}) INLINING.` );
                const stats = statSync(file);
                if (stats.size < inlineSize) {
                    const fileContent = readFileSync(file, 'utf-8');
                    let inlineTag="";
                    if (file.endsWith('.svg')) {
                        let inlineContent = optimize(fileContent, { multipass: true }).data;
                        inlineTag = inlineContent.replace('<svg ', `<svg ${attributes.trim()} `).replaceAll('"',"'");
                    } else {
                        inlineTag = `<img src='data:image/${file.split('.').pop()};base64,${Buffer.from(fileContent).toString('base64')}' />`;
                    }
                    console.log( ` --* Pushing (${match[3]})[${stats.size} bytes] INLINE (with attributes: ${attributes.trim().substring(0,20)}...)`)
                    code = code.replace(match[0], inlineTag);

                } else if( ['jpg','jpeg','png','webp'].includes(ext) ){
                    if( !resizeEnable ){
                        console.log( ` --X Skipping (${match[3]})[${stats.size} bytes] because resizeEnable off.`)
                        continue;
                    }
                    // resizeEnable could be true, so it resizes but doesn't limit max size
                    const [maxWidth, maxHeight] = resizeEnable.length > 2 && resizeEnable.indexOf('x') > 0
                        ? resizeEnable.split('x').map(Number) : [1, 1];

                    // larger so optimizer if possible.
                    const styleMatch = attributes.match(/style="([^"]+)"/i);
                    const widthMatch = attributes.match(/width="([^"]+)"/i);
                    const heightMatch = attributes.match(/height="([^"]+)"/i);

                    let width = widthMatch ? parseInt(widthMatch[1], 10) : null;
                    let height = heightMatch ? parseInt(heightMatch[1], 10) : null;

                    if (styleMatch) {
                        const style = styleMatch[1];
                        const styleWidthMatch = style.match(/width:\s*(\d+)px/);
                        const styleHeightMatch = style.match(/height:\s*(\d+)px/);

                        if (styleWidthMatch) width = parseInt(styleWidthMatch[1], 10);
                        if (styleHeightMatch) height = parseInt(styleHeightMatch[1], 10);
                    }

                    // If only one dimension is provided, calculate the other based on the aspect ratio
                    const metadata = await sharp(file).metadata();
                    const aspectRatio = metadata.height / metadata.width;

                    // calculate corresponding extry if only width/height given
                    if (width && !height) 
                        height = Math.round(width * aspectRatio);
                    else if (height && !width) 
                        width = Math.round(height / aspectRatio);
                    else {
                        // or if none given, we assign them to image dimensions
                        width = metadata.width;
                        height = metadata.height;
                    }

                    // shrink to maxWidth/maxHeight
                    if( maxWidth>1 && (width>maxWidth || height>maxHeight) ){
                        const widthRatio = maxWidth / metadata.width;
                        const heightRatio = maxHeight / metadata.height;
                        const scaleFactor = Math.min(widthRatio, heightRatio);
                        width = metadata.width * scaleFactor;
                        height = metadata.height * scaleFactor;
                    }

                    // Optimize the image with the extracted width and height
                    const newImgName = imgName.replace(`.${ext}`, `.${width}x${height}.${ext}`);
                    // const newFile = resolve( resizeDir, newImgName );
                    const newFile = file.replace(`.${ext}`, `.${width}x${height}.${ext}`);
                    
                    // console.log( ` .... optimized(${file}) --> ${width} x ${height} --> trying to write to: ${newFile}`)
                    if( metadata.format=='jpeg' )
                        await sharp(file).resize(width,height).jpeg({ quality, mozjpeg: true }).toFile(newFile);
                    else if( metadata.format=='png' )
                        await sharp(file).resize(width,height).png({ quality, compressionLevel: 7 }).toFile(newFile);
                    else if( metadata.format=='webp' )
                        await sharp(file).resize(width,height).webp({ quality, lossless: false }).toFile(newFile);

                    const newStats = statSync(newFile);
                    console.log( ` --* Resizing (${imgName})[${Math.round(stats.size/1024)}kb](${metadata.width}x${metadata.height}) to (${newFile.split('/').pop()})[${Math.round(newStats.size/1024)}kb](${width}x${height}) ` )

                    // inlineTag = inlineContent.replace('<svg ', `<svg ${attributes.trim()} `).replaceAll('"',"'");
                    // change reference to src path (relative to /src which is root directory)
                    // with revised pic (vite will put in the dest assets directory)
                    const updatedTag =`<img ${attributes.trim()} src='${srcPath.replace('src/','')+'/'+newImgName}' />`;
                    // console.log( ` updated Tag: `, updatedTag )
                    code = code.replace(match[0], updatedTag);
                }
                }
            }
      return code;
    },
  };
};