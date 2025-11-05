# API Setup for County Demographics

This application can fetch demographic data from the U.S. Census Bureau API for counties that don't have data in the local `demographics.json` file.

## Census Bureau API

### Getting an API Key (Recommended)

1. Visit https://api.census.gov/data/key_signup.html
2. Register for a free API key
3. Create a `.env` file in the project root:
   ```
   VITE_CENSUS_API_KEY=your_api_key_here
   ```
4. Restart the development server

### API Key Benefits

- Higher rate limits
- More reliable access
- Access to additional datasets

### Without API Key

The application will attempt to query the Census API without a key. Some endpoints may work, but:
- Lower rate limits
- May encounter CORS issues
- Less reliable access

## How It Works

1. When you double-click a county without local data:
   - Shows a loading indicator
   - Queries the Census Bureau API
   - Displays fetched data in the modal
   - Caches the data in memory (not saved to file)

2. Data Fetched:
   - Total Population
   - Gender Distribution
   - Median Age
   - Median Household Income
   - County Name

## Census API Variables Used

- `B01001_001E` - Total Population
- `B01001_002E` - Male Population
- `B01001_026E` - Female Population
- `B01002_001E` - Median Age
- `B19013_001E` - Median Household Income

For more variables and documentation, visit:
https://api.census.gov/data/2022/acs/acs5/variables.html

## Error Handling

If the API fetch fails:
- Check your internet connection
- Verify API key is correct (if using one)
- Census API may be temporarily unavailable
- Some endpoints may require CORS configuration

## Note on CORS

The Census Bureau API may have CORS restrictions when accessed directly from the browser. If you encounter CORS errors:

1. Use a Census API key (recommended)
2. Set up a backend proxy server
3. Use server-side data fetching

## Data Source

All fetched data comes from:
- **U.S. Census Bureau American Community Survey (ACS) 5-Year Estimates (2022)**
- Most comprehensive and recent county-level demographic data
- Updated annually

