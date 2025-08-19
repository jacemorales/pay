const axios = require('axios');
const mysql = require('mysql2/promise');
const nodemailer = require('nodemailer');

// This function sends a receipt email using Nodemailer and SMTP.
async function sendReceiptEmail(toEmail, reference, amountNaira) {
    const {
        MAIL_HOST,
        MAIL_PORT,
        MAIL_USERNAME,
        MAIL_PASSWORD,
        MAIL_ENCRYPTION,
        MAIL_FROM_ADDRESS,
        MAIL_FROM_NAME
    } = process.env;

    if (!MAIL_HOST || !MAIL_PORT || !MAIL_USERNAME || !MAIL_PASSWORD) {
        console.log('Email service not configured. Skipping receipt.');
        return;
    }

    try {
        const transporter = nodemailer.createTransport({
            host: MAIL_HOST,
            port: parseInt(MAIL_PORT, 10),
            secure: MAIL_ENCRYPTION === 'tls', // true for 465, false for other ports
            auth: {
                user: MAIL_USERNAME,
                pass: MAIL_PASSWORD,
            },
        });

        const mailOptions = {
            from: `"${MAIL_FROM_NAME}" <${MAIL_FROM_ADDRESS}>`,
            to: toEmail,
            subject: `Payment Receipt - ${reference}`,
            html: `
                <h1>Payment Successful!</h1>
                <p>Thank you for your payment.</p>
                <p><strong>Reference:</strong> ${reference}</p>
                <p><strong>Amount:</strong> ₦${Number(amountNaira).toFixed(2)}</p>
            `,
        };

        let info = await transporter.sendMail(mailOptions);
        console.log('Message sent: %s', info.messageId);

    } catch (error) {
        console.error('Failed to send receipt email:', error);
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

        if (transactionData && transactionData.status === 'success') {
            try {
                const connection = await mysql.createConnection({
                    host: process.env.DB_HOST,
                    user: process.env.DB_USER,
                    password: process.env.DB_PASSWORD,
                    database: process.env.DB_NAME,
                    port: process.env.DB_PORT || 3306
                });

                const sql = `
                    UPDATE payments
                    SET current_status = ?, completed_at = ?
                    WHERE reference = ?
                `;

                await connection.execute(sql, [transactionData.status, new Date(), reference]);
                await connection.end();

                const amountNaira = transactionData.amount / 100;
                await sendReceiptEmail(transactionData.customer.email, reference, amountNaira);

            } catch (dbError) {
                console.error('Database Error on verification:', dbError);
            }
        }

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
