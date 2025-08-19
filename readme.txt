# Payment Platform with React and Serverless Functions

## Project Overview

This project is a payment application that uses React for the frontend and Node.js serverless functions for the backend. It integrates with the Paystack API to handle payments. The project is configured for easy deployment on Netlify.


## Project Structure

- `/client`: Contains the React frontend application.
- `/netlify/functions`: Contains the Node.js serverless functions that act as the backend API.
- `/package.json`: Manages the backend dependencies for the serverless functions.


## How to Run Locally

To run this project locally, you will need to run the frontend and the serverless functions simultaneously.

1.  **Run the Frontend:**
    -   Navigate to the `client` directory: `cd client`
    -   Install dependencies: `npm install`
    -   Start the React development server: `npm start`
    -   The frontend will be available at `http://localhost:3000`.

2.  **Run the Backend:**
    -   You need the Netlify CLI to run the serverless functions locally.
    -   Install the Netlify CLI: `npm install -g netlify-cli`
    -   From the root of the project, run: `netlify dev`
    -   This will start a local server (usually on port 8888) that serves both your React app and the serverless functions. Your environment variables should be in a `.env` file in the root for local development.


## Environment Variables

For the application to work (both locally with `netlify dev` and in production on Netlify), you must set the following environment variables. For production, set these in your Netlify site's settings under "Build & deploy" > "Environment".

**Paystack Configuration:**
- `PAYSTACK_SECRET`: Your Paystack secret key (e.g., sk_test_...).
- `APP_URL`: The public URL of your deployed application (e.g., https://your-site.netlify.app). This is used for the Paystack callback.

**Database Configuration (for a cloud-hosted MySQL database):**
- `DB_HOST`: The hostname of your database server.
- `DB_USER`: The username for your database.
- `DB_PASSWORD`: The password for your database.
- `DB_NAME`: The name of your database.
- `DB_PORT`: The port of your database server (e.g., 3306).

**Email Configuration (for sending receipts via a transactional email service):**
- `MAILER_API_KEY`: The API key for your email service (e.g., SendGrid).
- `MAILER_URL`: The API endpoint for your email service (e.g., https://api.sendgrid.com/v3/mail/send).
- `MAIL_FROM_ADDRESS`: The email address to send receipts from.
- `MAIL_FROM_NAME`: The name to send receipts from.


## Deployment

This project is configured for deployment on Netlify.
1.  Push the code to a GitHub repository.
2.  Create a new site on Netlify and link it to your GitHub repository.
3.  Configure the environment variables in the Netlify UI as described above.
4.  Netlify will automatically use the `netlify.toml` file to build and deploy your site and serverless functions.
