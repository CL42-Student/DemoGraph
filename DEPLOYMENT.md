# Deployment Guide for DemoGraph

This guide covers deploying the DemoGraph application to various hosting platforms.

## Prerequisites

- Node.js 18+ installed
- npm or yarn package manager
- Account on your chosen hosting platform

## Build the Project Locally

Before deploying, test the build locally:

```bash
npm install
npm run build
npm run preview
```

The `dist` folder will contain the production-ready files.

## Deployment Options

### Option 1: Vercel (Recommended - Easiest)

Vercel provides excellent support for Vite projects with zero configuration.

#### Method A: Deploy via Vercel CLI

1. Install Vercel CLI:
   ```bash
   npm i -g vercel
   ```

2. Login to Vercel:
   ```bash
   vercel login
   ```

3. Deploy:
   ```bash
   vercel
   ```

4. Follow the prompts to link your project

#### Method B: Deploy via GitHub Integration

1. Push your code to a GitHub repository
2. Go to [vercel.com](https://vercel.com)
3. Click "New Project"
4. Import your GitHub repository
5. Vercel will auto-detect Vite and deploy
6. Your site will be live at `your-project.vercel.app`

**Environment Variables:**
- Add `VITE_CENSUS_API_KEY` in Vercel dashboard under Settings → Environment Variables

### Option 2: Netlify

Netlify also offers excellent Vite support.

#### Method A: Deploy via Netlify CLI

1. Install Netlify CLI:
   ```bash
   npm i -g netlify-cli
   ```

2. Login:
   ```bash
   netlify login
   ```

3. Deploy:
   ```bash
   netlify deploy --prod
   ```

#### Method B: Deploy via GitHub Integration

1. Push your code to a GitHub repository
2. Go to [netlify.com](https://netlify.com)
3. Click "Add new site" → "Import an existing project"
4. Connect your GitHub repository
5. Netlify will auto-detect settings from `netlify.toml`
6. Your site will be live at `your-project.netlify.app`

**Environment Variables:**
- Add `VITE_CENSUS_API_KEY` in Netlify dashboard under Site settings → Environment variables

### Option 3: GitHub Pages

GitHub Pages is free and works well for static sites.

#### Setup Steps:

1. **Update vite.config.js base path** (if deploying to a subdirectory):
   - If repository name is not `DemoGraph`, update the base path in `vite.config.js`

2. **Push code to GitHub**:
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git remote add origin https://github.com/yourusername/DemoGraph.git
   git push -u origin main
   ```

3. **Enable GitHub Pages**:
   - Go to your repository on GitHub
   - Click Settings → Pages
   - Under "Source", select "GitHub Actions"
   - The workflow in `.github/workflows/deploy.yml` will automatically deploy

4. **Your site will be available at:**
   - `https://yourusername.github.io/DemoGraph/`

**Note:** For GitHub Pages, you may need to update the base path in `vite.config.js` to match your repository name.

### Option 4: Other Static Hosting

The built `dist` folder can be deployed to any static hosting service:

- **AWS S3 + CloudFront**
- **Azure Static Web Apps**
- **Cloudflare Pages**
- **Firebase Hosting**
- **Surge.sh**

#### Generic Static Hosting Steps:

1. Build the project:
   ```bash
   npm run build
   ```

2. Upload the contents of the `dist` folder to your hosting provider

3. Ensure your hosting provider supports:
   - Single Page Application (SPA) routing
   - Serves `index.html` for all routes

## Environment Variables

For production deployment, you'll need to set environment variables:

### Required for Census API:
- `VITE_CENSUS_API_KEY` - Your U.S. Census Bureau API key (optional but recommended)

### Setting Environment Variables:

**Vercel:**
- Settings → Environment Variables → Add `VITE_CENSUS_API_KEY`

**Netlify:**
- Site settings → Environment variables → Add `VITE_CENSUS_API_KEY`

**GitHub Pages:**
- Repository Settings → Secrets and variables → Actions → New repository secret
- Add `VITE_CENSUS_API_KEY`
- Update workflow file to use secrets if needed

## Build Optimization

The production build includes:
- Minified JavaScript and CSS
- Optimized assets
- Tree-shaking for unused code
- Code splitting for faster loading

## Troubleshooting

### Build Fails
- Check Node.js version (requires 18+)
- Clear `node_modules` and reinstall: `rm -rf node_modules && npm install`
- Check for TypeScript errors (if applicable)

### Routes Not Working
- Ensure your hosting provider is configured for SPA routing
- Check that `index.html` is served for all routes (see `vercel.json` or `netlify.toml`)

### API Calls Fail
- Verify `VITE_CENSUS_API_KEY` is set in production environment
- Check CORS settings
- Review browser console for errors

### Assets Not Loading
- Verify `base` path in `vite.config.js` matches your deployment URL structure
- Check that `public` folder contents are copied to `dist`

## Continuous Deployment

All recommended platforms (Vercel, Netlify, GitHub Pages) support automatic deployments:
- Push to `main` branch → Automatic deployment
- Preview deployments for pull requests
- Rollback capabilities

## Custom Domain

All platforms support custom domains:
- **Vercel:** Settings → Domains
- **Netlify:** Domain settings → Add custom domain
- **GitHub Pages:** Settings → Pages → Custom domain

## Performance Tips

1. Enable CDN caching for static assets
2. Use production API endpoints
3. Monitor bundle size
4. Enable compression (usually automatic on modern platforms)

## Support

For deployment issues:
- Check platform-specific documentation
- Review build logs in your hosting dashboard
- Verify all environment variables are set
- Test build locally first: `npm run build && npm run preview`

