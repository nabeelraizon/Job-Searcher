import nodemailer from "nodemailer";

export const sendEmail = async (jobs, jobHrFeedbackResults) => {
  const jobHrFeedbackResultsMapped = jobHrFeedbackResults.map(
    (jobHrFeedbackResult) => {
      return {
        id: jobHrFeedbackResult.id,
        feedback: jobHrFeedbackResult.jobHrFeedback,
      };
    }
  );

  const transporter = nodemailer.createTransport({
    host: "smtp.office365.com",
    port: 587,
    secure: false,
    auth: {
      user: "someone@someone.com", 
      pass: "abc123", 
    },
  });

  try {
    const message = {
      from: "someone@someone.com", 
      to: "someone@someone.com", 
      subject: "New Job Opportunities",
      html: `<html>
  <head>
    <style>
      .job-card {
        border: 1px solid #ccc;
        padding: 10px;
        margin-bottom: 20px;
      }
      
      .job-title {
        color: #333;
        margin-bottom: 10px;
      }
      
      .job-details {
        margin-bottom: 10px;
      }
      
      .job-link {
        color: blue;
        text-decoration: underline;
      }
      
      .job-keywords {
        margin-top: 10px;
      }
    </style>
  </head>
  <body>
    ${jobs
      .map(
        (job) => `
          <div class="job-card">
            <h2 class="job-title">${job.title}</h2>
            <p><strong>Company:</strong> ${job.company}</p>
            <p><strong>Location:</strong> ${job.location}</p>
            <p class="job-details"><strong>Job Description:</strong></p>
            <p>${job.details}</p>
            <p class="job-details"><strong>You HR Helper Feedback:</strong></p>
            <p>"${
              (
                jobHrFeedbackResultsMapped.find(
                  (f) => f.id.toString() === job.id.toString()
                ) || {}
              ).feedback || ""
            }"</p>
            <p><strong>Link:</strong> <a class="job-link" href="${job.url}">${
          job.url
        }</a></p>
            <p class="job-keywords"><strong>Keywords:</strong> ${job.keywords.join(
              ", "
            )}</p>
          </div>
        `
      )
      .join("")}
  </body>
</html>`,
    };

    const info = await transporter.sendMail(message);
    console.log("Email sent:", info.messageId);
  } catch (error) {
    console.log("Error sending email:", error);
  }
};

export default sendEmail;
