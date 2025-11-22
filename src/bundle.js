import { build } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';
import * as critical from 'critical';
import { minify } from 'html-minifier-terser';
import path from 'path';
import fs from 'fs/promises';
import { JSDOM } from 'jsdom';

export async function bundle(htmlFile, options = {}) {
    // 1. Calculate Absolute Paths
    const absoluteEntryPath = path.resolve(htmlFile);
    const rootDir = path.dirname(absoluteEntryPath);
    const entryFilename = path.basename(absoluteEntryPath);

    // Check if file exists
    try {
        await fs.access(absoluteEntryPath);
    } catch (e) {
        throw new Error(`File not found: ${absoluteEntryPath}`);
    }

    // 2. Configuration - Extract all boolean options with defaults
    const { 
        inlineImages = true, 
        inlineJs = true,
        inlineCss = true,
        pruneCss = true, 
        minifyHtml = true,
        minifyJs = true,
        minifyCss = true,
        removeComments = true,
        removeRedundantAttributes = true,
        collapseWhitespace = true,
        useViteBuild = true,
        useCriticalCss = true,
        criticalWidth = 1300,
        criticalHeight = 900,
        outputFileName = 'index.html',
        ...config 
    } = options;
    
    const CONFIG = {
        entryFile: entryFilename,
        outDir: path.resolve(rootDir, 'dist'),
        outName: outputFileName,
        vite: {
            enabled: useViteBuild,
            minifyJs: minifyJs,
        },
        critical: {
            enabled: useCriticalCss && pruneCss,
            strip: pruneCss,
            width: criticalWidth,
            height: criticalHeight
        },
        minify: {
            enabled: minifyHtml,
            options: {
                removeComments,
                removeRedundantAttributes,
                removeScriptTypeAttributes: true,
                removeStyleLinkTypeAttributes: true,
                removeAttributeQuotes: removeRedundantAttributes,
                useShortDoctype: true,
                collapseWhitespace,
                collapseInlineTagWhitespace: collapseWhitespace,
                removeEmptyAttributes: removeRedundantAttributes,
                minifyCSS: minifyCss,
                minifyJS: minifyJs,
                minifyURLs: true,
                sortAttributes: true,
                sortClassName: true
            }
        },
        inline: {
            images: inlineImages,
            js: inlineJs,
            css: inlineCss
        },
        ...config
    };

    console.log('ℹ️  Root Dir:', rootDir);
    console.log('ℹ️  Entry File:', absoluteEntryPath);
    console.log('ℹ️  Options:', {
        inlineImages,
        inlineJs,
        inlineCss,
        pruneCss,
        minifyHtml,
        minifyJs,
        minifyCss,
        useCriticalCss,
        useViteBuild
    });

    try {
        console.log(`🚀 Starting build...`);

        // 3. VITE BUILD
        if (CONFIG.vite.enabled) {
            await build({
                root: rootDir,
                base: './', // CRITICAL: Ensures assets are resolved relatively
                configFile: false,
                build: {
                    outDir: CONFIG.outDir,
                    emptyOutDir: true,
                    minify: CONFIG.vite.minifyJs ? 'esbuild' : false,
                    // Control image inlining via assetsInlineLimit
                    assetsInlineLimit: CONFIG.inline.images ? 100000000 : 0, // 100MB if inlining images, 0KB if not
                    cssCodeSplit: false, // Keep CSS together to make inlining easier
                    modulePreload: { polyfill: false },
                    rollupOptions: {
                        input: absoluteEntryPath,
                        output: {
                            inlineDynamicImports: true,
                            manualChunks: undefined,
                        },
                    },
                },
                plugins: [
                    // Always use viteSingleFile to ensure HTML generation
                    viteSingleFile({
                        removeViteModuleLoader: true,
                        useRecommendedBuildConfig: false,
                    }),
                ],
                logLevel: 'info',
            });
        } else {
            console.log('⏭️  Skipping Vite build (useViteBuild=false)');
            // Copy original file to dist directory
            await fs.mkdir(CONFIG.outDir, { recursive: true });
            await fs.copyFile(absoluteEntryPath, path.join(CONFIG.outDir, CONFIG.outName));
        }

        // Handle custom output filename by renaming if necessary
        let distFilePath = path.join(CONFIG.outDir, 'index.html');
        const finalDistFilePath = path.join(CONFIG.outDir, CONFIG.outName);
        
        if (CONFIG.outName !== 'index.html') {
            console.log(`📝 Renaming output file to: ${CONFIG.outName}`);
            await fs.rename(distFilePath, finalDistFilePath);
            distFilePath = finalDistFilePath;
        }

        // 4. POST-PROCESS: Inline remaining local assets manually and fix paths
        console.log('🔧 Post-processing to inline remaining local assets...');
        let htmlContent = await fs.readFile(distFilePath, 'utf-8');
        const needsProcessing = CONFIG.inline.js || CONFIG.inline.css || !CONFIG.inline.images;

        if (needsProcessing) {
            htmlContent = await inlineRemainingAssets(htmlContent, rootDir, CONFIG.inline);

            // Fix CSS background-image paths when images are not inlined
            if (!CONFIG.inline.images) {
                console.log('🖼️  Fixing CSS background-image paths for external images...');
                
                // Import fs synchronously for file existence checks
                const { existsSync } = await import('fs');
                
                // Fix background-image URLs in CSS to point to assets directory
                htmlContent = htmlContent.replace(
                    /background[^:]*:([^;}]*url\()(\.\/?)([^)]+\.(jpg|jpeg|png|gif|webp|svg))\)/gi,
                    (match, prefix, oldPath, filename, ext) => {
                        // Check if this file exists in assets directory
                        const assetsPath = path.join(CONFIG.outDir, 'assets', filename);
                        if (existsSync(assetsPath)) {
                            const newUrl = `${prefix}./assets/${filename})`;
                            console.log(`✅ Fixed background path: ${filename} -> ./assets/${filename}`);
                            return match.replace(`${prefix}${oldPath}${filename})`, newUrl);
                        }
                        return match;
                    }
                );
            }

            await fs.writeFile(distFilePath, htmlContent);
        }

        // 5. CRITICAL CSS (Post-Process)
        if (CONFIG.critical.enabled) {
            console.log('🎨 Generating Critical CSS...');
            
            // Critical must run on the GENERATED file in dist
            await critical.generate({
                base: CONFIG.outDir,
                src: CONFIG.outName,
                target: CONFIG.outName,
                inline: true,
                extract: CONFIG.critical.strip,
                width: CONFIG.critical.width,
                height: CONFIG.critical.height,
                // Add both root and dist to asset paths so it finds images
                assetPaths: [rootDir, CONFIG.outDir], 
            });
            console.log('✨ Critical CSS injected.');
        }

        // 6. HTML MINIFICATION
        if (CONFIG.minify.enabled) {
            console.log('🗜️  Minifying HTML...');
            
            let finalHtml = await fs.readFile(distFilePath, 'utf-8');
            const originalSize = Buffer.byteLength(finalHtml, 'utf8');
            
            finalHtml = await minify(finalHtml, CONFIG.minify.options);
            const minifiedSize = Buffer.byteLength(finalHtml, 'utf8');
            const reduction = ((originalSize - minifiedSize) / originalSize * 100).toFixed(1);
            
            await fs.writeFile(distFilePath, finalHtml);
            
            console.log(`✨ HTML minified: ${(originalSize / 1024).toFixed(2)} KB → ${(minifiedSize / 1024).toFixed(2)} KB (${reduction}% reduction)`);
        }

        // 7. FINALIZE
        const stats = await fs.stat(distFilePath);
        console.log(`\n✅ Build Complete!`);
        console.log(`📂 Output: ${distFilePath}`);
        console.log(`📦 Size: ${(stats.size / 1024).toFixed(2)} KB`);

        return await fs.readFile(distFilePath, 'utf-8');

    } catch (error) {
        console.error('❌ Build failed:', error);
        throw error;
    }
}

async function inlineRemainingAssets(htmlContent, rootDir, inlineOptions = { js: true, css: true, images: true }) {
    const dom = new JSDOM(htmlContent);
    const document = dom.window.document;
    
    // Conditionally inline local JavaScript files
    if (inlineOptions.js) {
        console.log('📄 Inlining JavaScript files...');
        const scriptTags = document.querySelectorAll('script[src]');
        for (const script of scriptTags) {
            const src = script.getAttribute('src');
            
            // Skip external URLs
            if (src.startsWith('http://') || src.startsWith('https://') || src.startsWith('//')) {
                continue;
            }
            
            try {
                const scriptPath = path.resolve(rootDir, src);
                const scriptContent = await fs.readFile(scriptPath, 'utf-8');
                
                // Create new inline script tag
                const inlineScript = document.createElement('script');
                inlineScript.textContent = scriptContent;
                
                // Copy other attributes except src
                for (const attr of script.attributes) {
                    if (attr.name !== 'src') {
                        inlineScript.setAttribute(attr.name, attr.value);
                    }
                }
                
                // Replace the script tag
                script.parentNode.replaceChild(inlineScript, script);
                console.log(`✅ Inlined JavaScript: ${src}`);
            } catch (error) {
                console.warn(`⚠️  Could not inline JavaScript file: ${src} - ${error.message}`);
            }
        }
    } else {
        console.log('⏭️  Skipping JavaScript inlining (inlineJs=false)');
    }
    
    // Conditionally inline local CSS files
    if (inlineOptions.css) {
        console.log('🎨 Inlining CSS files...');
        const linkTags = document.querySelectorAll('link[rel="stylesheet"][href]');
        for (const link of linkTags) {
            const href = link.getAttribute('href');
            
            // Skip external URLs
            if (href.startsWith('http://') || href.startsWith('https://') || href.startsWith('//')) {
                continue;
            }
            
            try {
                // Try multiple potential paths for CSS files
                let cssPath;
                let cssContent;
                
                // First try: relative to rootDir (original location)
                cssPath = path.resolve(rootDir, href);
                try {
                    cssContent = await fs.readFile(cssPath, 'utf-8');
                } catch (error) {
                    // Second try: relative to dist directory (Vite output location)
                    const distDir = path.dirname(path.join(rootDir, 'dist', 'index.html'));
                    cssPath = path.resolve(distDir, href);
                    cssContent = await fs.readFile(cssPath, 'utf-8');
                }
                
                // Create new inline style tag
                const inlineStyle = document.createElement('style');
                inlineStyle.textContent = cssContent;
                
                // Copy other attributes except href and rel
                for (const attr of link.attributes) {
                    if (attr.name !== 'href' && attr.name !== 'rel') {
                        inlineStyle.setAttribute(attr.name, attr.value);
                    }
                }
                
                // Replace the link tag
                link.parentNode.replaceChild(inlineStyle, link);
                console.log(`✅ Inlined CSS: ${href}`);
            } catch (error) {
                console.warn(`⚠️  Could not inline CSS file: ${href} - ${error.message}`);
            }
        }
    } else {
        console.log('⏭️  Skipping CSS inlining (inlineCss=false)');
    }
    
    // Conditionally inline local images as base64
    if (inlineOptions.images) {
        console.log('🖼️  Inlining images as base64...');
        const imgTags = document.querySelectorAll('img[src]');
        for (const img of imgTags) {
            const src = img.getAttribute('src');
            
            // Skip external URLs and already base64 encoded images
            if (src.startsWith('http://') || src.startsWith('https://') || src.startsWith('//') || src.startsWith('data:')) {
                continue;
            }
            
            try {
                const imgPath = path.resolve(rootDir, src);
                const imgBuffer = await fs.readFile(imgPath);
                const ext = path.extname(imgPath).toLowerCase();
                
                let mimeType;
                switch (ext) {
                    case '.jpg':
                    case '.jpeg':
                        mimeType = 'image/jpeg';
                        break;
                    case '.png':
                        mimeType = 'image/png';
                        break;
                    case '.gif':
                        mimeType = 'image/gif';
                        break;
                    case '.svg':
                        mimeType = 'image/svg+xml';
                        break;
                    case '.webp':
                        mimeType = 'image/webp';
                        break;
                    default:
                        console.warn(`⚠️  Unsupported image format: ${ext} for ${src}`);
                        continue;
                }
                
                const base64 = imgBuffer.toString('base64');
                const dataUrl = `data:${mimeType};base64,${base64}`;
                img.setAttribute('src', dataUrl);
                console.log(`✅ Inlined image: ${src}`);
            } catch (error) {
                console.warn(`⚠️  Could not inline image: ${src} - ${error.message}`);
            }
        }
    } else {
        console.log('⏭️  Skipping image inlining (inlineImages=false)');
    }
    
    return dom.serialize();
}