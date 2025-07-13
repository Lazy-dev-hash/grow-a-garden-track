
# Facebook Bot Setup Instructions

## 1. Create Facebook App and Page

1. Go to [Facebook Developers](https://developers.facebook.com/)
2. Create a new app
3. Add "Messenger" product to your app
4. Create a Facebook Page for your bot

## 2. Get Access Tokens

1. **Page Access Token**: 
   - Go to Messenger > Settings
   - Select your page and generate a token
   - Add this to your Replit Secrets as `FACEBOOK_PAGE_ACCESS_TOKEN`

2. **Page ID**:
   - Go to your Facebook Page
   - Click "About" > "Page Transparency"
   - Copy the Page ID
   - Add this to your Replit Secrets as `FACEBOOK_PAGE_ID`

## 3. Setup Webhook

1. In Messenger Settings, add webhook URL: `https://your-repl-url.replit.dev/webhook`
2. Verify token: `garden_stock_webhook_token`
3. Subscribe to: `messages`, `messaging_postbacks`

## 4. Bot Commands

Users can message your Facebook page:
- "subscribe" or "notify" - Subscribe to notifications
- "unsubscribe" - Stop notifications  
- "stock" or "status" - Check current special items
- Any other message - Show help

## 5. Admin Panel

- Triple-click the main title to open admin panel
- Default passwords: admin123, stockadmin, gardenboss
- Add users to notifier list
- View subscriber list
- Remove subscribers

## 6. Monitored Items

The bot automatically notifies when these items are in stock:
- Master Sprinkler
- Godly Sprinkler  
- Advance Sprinkler
- Ember Lily
- Beanstalk
