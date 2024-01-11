import mongoose from "mongoose";
import dotenv from "dotenv";
import { Job } from "./models/job.js";
dotenv.config();

const mongoUrl = process.env.MONGO_URI;

const keywords = [
  "Junior",
  "Graduate/Junior",
  "Graduate",
  "React",
  "Javascript",
  "angular",
  "Vue",
  ".net",
  "sql",
  "node",
  "typescript",
  "remote",
  "work from home",
];

export const evaluate = async () => {
  const jobOutput = [];
  try {
    await mongoose.connect(mongoUrl, {
      useNewUrlParser: true,
    });

    const jobs = await Job.find({
      title: {
        $regex: "(Junior|Graduate/Junior|Graduate|React|Javascript|Vue|.NET)",
        $options: "i", 
      },
      keywords: {
        $in: keywords,
      },
    });

    for (const job of jobs) {
      const dateCrawled = job.dateCrawled;
      const listingDate = job.listingDate.replace("d ago", "");

      const currentDate = new Date();
      const daysElapsed = Math.floor(
        (currentDate - dateCrawled) / (24 * 60 * 60 * 1000)
      );

      const updatedListingDate = parseInt(listingDate) + daysElapsed;

      if (updatedListingDate > 30) {
        continue;
      }

      const jobTitle = job.title.toLowerCase();
      if (
        !jobTitle.includes("senior") &&
        !jobTitle.includes("lead") &&
        !jobTitle.includes("manager")
      ) {
        jobOutput.push(job);
      }
    }

    console.log("Jobs from database", jobs);
    return jobOutput;
  } catch (error) {
    console.log("Could not connect to MongoDB:", error);
    process.exit(1);
  }
};
