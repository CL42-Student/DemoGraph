# DemoGraph

An interactive web application for visualizing United States county-level demographic data.

## Features

- 🗺️ Interactive map navigation with zoom and pan
- 🔍 County search by name or FIPS code
- 📊 Comprehensive demographic statistics
- 📈 Income distribution comparisons
- 👥 Generational and ethnicity breakdowns
- 📌 History tracking with baseline comparisons
- 🌐 Real-time Census Bureau API integration

## Quick Start

### Prerequisites

- Node.js 18+ and npm

### Installation

```bash
npm install
```

### Development

```bash
npm run dev
```

Visit `http://localhost:5173`

### Build for Production

```bash
npm run build
npm run preview
```

## Deployment

This project is configured for deployment on multiple platforms:

- **Vercel** (recommended) - Zero-config deployment
- **Netlify** - Excellent Vite support
- **GitHub Pages** - Free static hosting

See [DEPLOYMENT.md](./DEPLOYMENT.md) for detailed deployment instructions.

## Environment Variables

Create a `.env` file in the root directory:

```env
VITE_CENSUS_API_KEY=your_api_key_here
```

Get your API key from: https://api.census.gov/data/key_signup.html

See [API_SETUP.md](./API_SETUP.md) for more details.

## Project Structure

```
DemoGraph/
├── public/          # Static assets (JSON data, logo)
├── src/             # Source code
│   ├── api/        # API integration
│   ├── charts/     # Chart components
│   ├── data/       # Data fetching utilities
│   └── utils/      # Utility functions
├── index.html      # Main HTML file
├── vite.config.js  # Vite configuration
└── package.json    # Dependencies
```

## Technologies

- **Vite** - Build tool and dev server
- **D3.js** - Data visualization and mapping
- **Chart.js** - Chart rendering
- **TopoJSON** - Geographic data format

## Data Sources

- U.S. Census Bureau American Community Survey (ACS) 5-Year Estimates (2022)
- Census Bureau TIGER/Line geographic data

## License

ISC

## Documentation

- [Deployment Guide](./DEPLOYMENT.md)
- [API Setup](./API_SETUP.md)
- [Instructions](./instructions.txt)

