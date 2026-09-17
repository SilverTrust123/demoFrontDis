const gulp = require('gulp');
const cleanCSS = require('gulp-clean-css');
const terser = require('gulp-terser');
const browserSync = require('browser-sync').create();
const { createProxyMiddleware } = require('http-proxy-middleware');
const fs = require('fs');

// 0. 清理 dist 目錄
function clean(cb) {
  if (fs.existsSync('./dist')) {
    fs.rmSync('./dist', { recursive: true, force: true });
  }
  cb();
}

// 1. 處理 CSS
function minifyCSS() {
  return gulp.src('./css/**/*.css', { allowEmpty: true })
    .pipe(cleanCSS())
    .pipe(gulp.dest('./dist/css'))
    .pipe(browserSync.stream());
}

// 2. 處理 JS
function minifyJS() {
  return gulp.src('./js/**/*.js', { allowEmpty: true })
    .pipe(terser())
    .pipe(gulp.dest('./dist/js'))
    .pipe(browserSync.stream());
}

// 2.1 處理 Eng JS
function minifyEngJS() {
  return gulp.src('./engjs/**/*.js', { allowEmpty: true })
    .pipe(terser())
    .pipe(gulp.dest('./dist/engjs'))
    .pipe(browserSync.stream());
}

// 3. 處理 HTML
function copyHTML() {
  return gulp.src('./html/**/*.html', { allowEmpty: true })
    .pipe(gulp.dest('./dist/html'))
    .pipe(browserSync.stream());
}

// 3.1 處理 Eng HTML
function copyEngHTML() {
  return gulp.src('./enghtml/**/*.html', { allowEmpty: true })
    .pipe(gulp.dest('./dist/enghtml'))
    .pipe(browserSync.stream());
}

// 4. 處理圖片
function copyPictures() {
  return gulp.src('./picture/**/*', { allowEmpty: true })
    .pipe(gulp.dest('./dist/picture'))
    .pipe(browserSync.stream());
}

// 5. 本地伺服器 + API Proxy 轉發設定
function serve(cb) {
  browserSync.init({
    server: {
      baseDir: './dist',
      middleware: [
        createProxyMiddleware({
          target: 'http://192.168.3.85:9090',
          changeOrigin: true,
          pathFilter: '/api',
          pathRewrite: {
            '^/api': ''
          }
        }),
        function (req, res, next) {
          res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
          next();
        }
      ]
    },
    port: 3000,
    startPath: '/html/index.html'
  });

  // 監聽原始檔變動
  gulp.watch('./css/**/*.css', minifyCSS);
  gulp.watch('./js/**/*.js', minifyJS);
  gulp.watch('./engjs/**/*.js', minifyEngJS);
  gulp.watch('./html/**/*.html', copyHTML);
  gulp.watch('./enghtml/**/*.html', copyEngHTML);
  gulp.watch('./picture/**/*', copyPictures);

  cb();
}

// 增量編譯任務（加入 minifyEngJS 與 copyEngHTML）
const compile = gulp.parallel(minifyCSS, minifyJS, minifyEngJS, copyHTML, copyEngHTML, copyPictures);

// 完整打包任務（清空 -> 重新編譯所有檔案）
const build = gulp.series(clean, compile);

// 開發模式（先清空 -> 重新編譯所有檔案 -> 開啟伺服器並監聽）
const dev = gulp.series(build, serve);

// 匯出指令
exports.default = dev;    // 執行 `gulp` 或 `npm run dev` 時使用（開發用）
exports.build = build;    // 執行 `npm run build` 時使用（純打包，不出伺服器）
exports.compile = compile;
exports.clean = clean;