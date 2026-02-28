# Save to PullRead — Apple Shortcuts

How to create an Apple Shortcut that saves URLs to PullRead from the Share Sheet.

## Create the Shortcut

1. Open the **Shortcuts** app.
2. Create a new Shortcut and name it "Save to PullRead".
3. Add these actions in order:

   **a. Receive input from Share Sheet**
   - Tap "Receive **Any** input from **Share Sheet**".
   - Change "Any" to **URLs** to filter for URLs only.

   **b. Get URLs from Input**
   - Add the **Get URLs from Input** action.
   - This extracts the URL from whatever was shared.

   **c. URL Encode**
   - Add the **URL Encode** action.
   - Set it to encode the output from the previous step.

   **d. Text**
   - Add a **Text** action.
   - Enter: `pullread://save?url=` followed by the URL Encoded output (tap the variable pill to insert it).

   **e. Open URLs**
   - Add the **Open URLs** action.
   - Pass it the Text from the previous step.

4. In the Shortcut's settings (info icon), enable **Show in Share Sheet**.

## Usage

In Safari or any app, tap the **Share** button, then select "Save to PullRead" from the Share Sheet. The article will be queued in PullRead for the next sync.

## How it works

The Shortcut constructs a `pullread://save?url=<encoded_url>` deep link and opens it. PullRead handles the URL scheme natively and adds the article to your inbox.
