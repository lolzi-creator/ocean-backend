# OCR Setup - Groq Vision API

This guide explains how to set up OCR (Optical Character Recognition) to automatically extract VIN and customer name from Fahrzeugausweis photos using Groq's AI vision model.

## Features

- ✅ **Automatic VIN extraction** - Extracts 17-character VIN from document photos
- ✅ **Customer name extraction** - Extracts customer name (Halter/Eigentümer)
- ✅ **AI-powered** - Uses Groq's Llama 3.2 Vision model for intelligent extraction
- ✅ **Graceful fallback** - Works without OCR (manual entry still available)

## Setup Instructions

### 1. Get Groq API Key

1. Go to [Groq Console](https://console.groq.com/)
2. Sign up or log in
3. Go to **API Keys** section
4. Click **Create API Key**
5. Copy your API key (starts with `gsk_...`)

### 2. Configure Backend

Add the following to your `.env` file:

```env
# Groq API (OCR)
GROQ_API_KEY="gsk_your_api_key_here"
```

**Important:**
- Keep your API key secure (never commit to git!)
- The API key is already in `.gitignore`

## Pricing

Groq API pricing (as of 2024):
- **Very fast inference** - Optimized for speed
- **Free tier available** - Check Groq Console for current limits
- **Pay-as-you-go** - Very affordable pricing
- Much simpler than Google Cloud setup!

## How It Works

1. User uploads Fahrzeugausweis photo
2. Backend converts image to base64
3. Sends image to Groq's Llama 3.2 Vision model
4. AI analyzes the document and extracts:
   - **VIN**: 17 alphanumeric characters
   - **Customer Name**: Full name of vehicle owner
5. Returns structured JSON with extracted data
6. Frontend auto-fills the extracted data
7. User can review and edit if needed

## Testing

1. Make sure `GROQ_API_KEY` is set in `.env`
2. Restart the backend server
3. Upload a Fahrzeugausweis photo in the vehicle entry form
4. Click "VIN & Name erkennen" button
5. Check if VIN and customer name are automatically filled

## Troubleshooting

**"OCR not working"**
- Check if `GROQ_API_KEY` is set correctly in `.env`
- Verify the API key is valid in Groq Console
- Check backend console for error messages
- Ensure backend was restarted after adding the key

**"No data extracted"**
- Photo quality might be too low
- Text might not be clearly visible
- Document format might be different
- Manual entry is always available as fallback

**"API rate limit"**
- Check your Groq account limits
- Wait a moment and try again
- Consider upgrading your Groq plan if needed

## Security Notes

- ⚠️ **Never commit** API keys to git
- API key is already in `.gitignore`
- Store keys securely (environment variables)
- Rotate keys periodically if needed

## Fallback Behavior

If OCR is not configured or fails:
- User can still manually enter VIN and customer name
- No errors are thrown
- System continues to work normally
- Graceful degradation ensures the app always works

## Advantages of Groq

- ✅ **Simpler setup** - Just one API key, no service accounts
- ✅ **Faster** - Optimized inference speed
- ✅ **AI-powered** - Better understanding of document structure
- ✅ **No complex credentials** - No JSON files to manage
- ✅ **Better extraction** - AI can understand context better than regex
