import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from config import Config

def send_otp_email(to_email: str, otp_code: str, purpose: str = 'password_reset') -> dict:
    """Send OTP code via Gmail SMTP"""
    
    if not Config.SMTP_EMAIL or not Config.SMTP_PASSWORD:
        print("⚠️ SMTP credentials not configured. OTP email not sent.")
        print(f"📧 OTP for {to_email}: {otp_code}")  # Log for development
        return {
            'success': True,
            'message': 'OTP generated (email not configured)',
            'dev_note': f'OTP: {otp_code}'  # Only in development
        }
    
    try:
        # Create message
        msg = MIMEMultipart('alternative')
        msg['From'] = f"CAIretaker <{Config.SMTP_EMAIL}>"
        msg['To'] = to_email
        
        if purpose == 'password_reset':
            msg['Subject'] = "🔐 CAIretaker - Password Reset Code"
            html_content = f"""
            <html>
            <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                <div style="background: linear-gradient(135deg, #142237 0%, #1E3A5F 100%); padding: 30px; border-radius: 10px; text-align: center;">
                    <h1 style="color: #fff; margin: 0;">🏥 CAIretaker</h1>
                    <p style="color: #A8D5E2; margin-top: 5px;">Fall Detection System</p>
                </div>
                
                <div style="padding: 30px; background: #f9f9f9; border-radius: 0 0 10px 10px;">
                    <h2 style="color: #142237;">Password Reset Request</h2>
                    <p style="color: #666;">We received a request to reset your password. Use the code below to proceed:</p>
                    
                    <div style="background: #142237; padding: 20px; border-radius: 8px; text-align: center; margin: 20px 0;">
                        <span style="font-size: 32px; font-weight: bold; color: #fff; letter-spacing: 8px;">{otp_code}</span>
                    </div>
                    
                    <p style="color: #666; font-size: 14px;">
                        ⏰ This code expires in <strong>{Config.OTP_EXPIRY_MINUTES} minutes</strong>.
                    </p>
                    <p style="color: #999; font-size: 12px;">
                        If you didn't request this, please ignore this email or contact support.
                    </p>
                </div>
                
                <p style="text-align: center; color: #999; font-size: 11px; margin-top: 20px;">
                    © 2026 CAIretaker. All rights reserved.
                </p>
            </body>
            </html>
            """
        elif purpose == 'email_verification':
            msg['Subject'] = "✅ CAIretaker - Verify Your Email"
            html_content = f"""
            <html>
            <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                <div style="background: linear-gradient(135deg, #142237 0%, #1E3A5F 100%); padding: 30px; border-radius: 10px; text-align: center;">
                    <h1 style="color: #fff; margin: 0;">🏥 CAIretaker</h1>
                    <p style="color: #A8D5E2; margin-top: 5px;">Fall Detection System</p>
                </div>
                
                <div style="padding: 30px; background: #f9f9f9; border-radius: 0 0 10px 10px;">
                    <h2 style="color: #142237;">Welcome to CAIretaker! 👋</h2>
                    <p style="color: #666;">Please verify your email address using the code below:</p>
                    
                    <div style="background: #142237; padding: 20px; border-radius: 8px; text-align: center; margin: 20px 0;">
                        <span style="font-size: 32px; font-weight: bold; color: #fff; letter-spacing: 8px;">{otp_code}</span>
                    </div>
                    
                    <p style="color: #666; font-size: 14px;">
                        ⏰ This code expires in <strong>{Config.OTP_EXPIRY_MINUTES} minutes</strong>.
                    </p>
                </div>
                
                <p style="text-align: center; color: #999; font-size: 11px; margin-top: 20px;">
                    © 2026 CAIretaker. All rights reserved.
                </p>
            </body>
            </html>
            """
        else:
            msg['Subject'] = "🔢 CAIretaker - Your Verification Code"
            html_content = f"""
            <html>
            <body style="font-family: Arial, sans-serif; padding: 20px;">
                <h2>Your CAIretaker Verification Code</h2>
                <p>Your code is: <strong style="font-size: 24px;">{otp_code}</strong></p>
                <p>This code expires in {Config.OTP_EXPIRY_MINUTES} minutes.</p>
            </body>
            </html>
            """
        
        msg.attach(MIMEText(html_content, 'html'))
        
        # Send email
        with smtplib.SMTP(Config.SMTP_SERVER, Config.SMTP_PORT) as server:
            server.starttls()
            server.login(Config.SMTP_EMAIL, Config.SMTP_PASSWORD)
            server.send_message(msg)
        
        print(f"✅ OTP email sent to {to_email}")
        return {'success': True, 'message': 'OTP sent to email'}
        
    except smtplib.SMTPAuthenticationError:
        print(f"❌ SMTP Authentication failed. Check your email credentials.")
        return {'success': False, 'error': 'Email service configuration error'}
    except Exception as e:
        print(f"❌ Failed to send email: {str(e)}")
        return {'success': False, 'error': f'Failed to send email: {str(e)}'}
