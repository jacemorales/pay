const axios = require('axios');
const mysql = require('mysql2/promise');

// This function is a placeholder for sending a receipt email.
// It would typically use a transactional email service like SendGrid, Mailgun, etc.
async function sendReceiptEmail(toEmail, reference, amountNaira) {
    const mailerApiKey = process.env.MAILER_API_KEY;
    const mailerUrl = process.env.MAILER_URL; // e.g., https://api.sendgrid.com/v3/mail/send
    const fromEmail = process.env.MAIL_FROM_ADDRESS;
    const fromName = process.env.MAIL_FROM_NAME;

    if (!mailerApiKey || !mailerUrl || !fromEmail) {
        console.log('Email service not configured. Skipping receipt.');
        return;
    }

    const emailData = {
        personalizations: [{ to: [{ email: toEmail }] }],
        from: { email: fromEmail, name: fromName },
        subject: `Payment Receipt - ${reference}`,
        content: [{
            type: 'text/html',
            value: `
                <h1>Payment Successful!</h1>
                <p>Thank you for your payment.</p>
                <p><strong>Reference:</strong> ${reference}</p>
                <p><strong>Amount:</strong> ₦${Number(amountNaira).toFixed(2)}</p>
            `
        }]
    };

    try {
        await axios.post(mailerUrl, emailData, {
            headers: {
                Authorization: `Bearer ${mailerApiKey}`,
                'Content-Type': 'application/json'
            }
        });
        console.log(`Receipt email sent to ${toEmail}`);
    } catch (error) {
        console.error('Failed to send receipt email:', error.response ? error.response.data : error.message);
    }
}


exports.handler = async function(event, context) {
    if (event.httpMethod !== 'GET') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    try {
        const { reference } = event.queryStringParameters;

        if (!reference) {
            return {
                statusCode: 400,
                body: JSON.stringify({ message: 'Payment reference is required.' })
            };
        }

        const paystackSecret = process.env.PAYSTACK_SECRET;
        if (!paystackSecret) {
            return {
                statusCode: 500,
                body: JSON.stringify({ message: 'Payment service not configured.' })
            };
        }

        const paystackResponse = await axios.get(
            `https://api.paystack.co/transaction/verify/${reference}`,
            { headers: { Authorization: `Bearer ${paystackSecret}` } }
        );

        const transactionData = paystackResponse.data.data;

        // --- Database Logic ---
        if (transactionData) {
            try {
                const connection = await mysql.createConnection({
                    host: process.env.DB_HOST,
                    user: process.env.DB_USER,
                    password: process.env.DB_PASSWORD,
                    database: process.env.DB_NAME,
                    port: process.env.DB_PORT || 3306
                });

                // We just update the status. A more robust implementation would update the transaction log JSON blob.
                const sql = `
                    UPDATE payments
                    SET current_status = ?, completed_at = ?
                    WHERE reference = ?
                `;

                const status = transactionData.status;
                const completedAt = (status === 'success') ? new Date() : null;

                await connection.execute(sql, [status, completedAt, reference]);
                await connection.end();

                // Send email on success
                if (status === 'success') {
                    const amountNaira = transactionData.amount / 100;
                    await sendReceiptEmail(transactionData.customer.email, reference, amountNaira);
                }

            } catch (dbError) {
                console.error('Database Error on verification:', dbError);
                // Log the error but don't fail the request, as the primary goal is to return verification status.
            }
        }
        // --- End of Database Logic ---

        return {
            statusCode: 200,
            body: JSON.stringify(transactionData)
        };

    } catch (error) {
        console.error('Verification Error:', error);
        if (error.response && error.response.status === 404) {
             return {
                statusCode: 404,
                body: JSON.stringify({ message: 'Transaction reference not found.' })
            };
        }
        return {
            statusCode: 500,
            body: JSON.stringify({ message: 'An unexpected error occurred.' })
        };
    }
};
