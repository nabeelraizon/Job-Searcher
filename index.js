import puppeteer from "puppeteer";
import constants, { KEYWORDS } from "./utils/constants.js";
import mongoose from "mongoose"; 
import dotenv from "dotenv";
import { Job } from "./models/job.js"; 
import { evaluate } from "./evaluate.js";
import { OpenAI } from "langchain/llms/openai";
import { OpenAIEmbeddings } from "langchain/embeddings/openai";
import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";
import { DocxLoader } from "langchain/document_loaders/fs/docx";
import { TextLoader } from "langchain/document_loaders/fs/text";
import { HNSWLib } from "langchain/vectorstores";
import { DirectoryLoader } from "langchain/document_loaders/fs/directory";
import { PDFLoader } from "langchain/document_loaders/fs/pdf";
import { RetrievalQAChain } from "langchain/chains";
import getSingleJobDetails from "./getSingleJobDetails.js";
import sendEmail from "./email.js";

dotenv.config(); 
const mongoUrl = process.env.MONGO_URI; 

const jobTitle = "Software Engineer";
const jobLocation = "New York"; 
const searchUrl = constants.SEEK_URL + jobTitle + "-jobs?where=" + jobLocation;

export default async function runJobScrape() {
  const browser = await puppeteer.launch({
    headless: false, 
    args: ["--no-sandbox"], 
  });

  const page = await browser.newPage(); 

  await page.goto(constants.SEEK_URL); 
  await page.click(constants.KEYWORDS);
  await page.keyboard.type(jobTitle); 
  await page.click(constants.LOCATION); 
  await page.keyboard.type(jobLocation);
  await page.click(constants.SEARCH); 
  await new Promise((r) => setTimeout(r, 2000)); 


  let numPages = await getNumPages(page); 
  console.log("getNumPages => total: ", numPages);

  const jobList = []; 

  for (let h = 1; h <= numPages; h++) {
    let pageUrl = searchUrl + "&page=" + h; 
    await page.goto(pageUrl); 
    console.log(`Page ${h}`); 

    
    const jobElements = await page.$$(
      "div._1wkzzau0.szurmz0.szurmzb div._1wkzzau0.a1msqi7e"
    );

    for (const element of jobElements) {
      const jobTitleElement = await element.$('a[data-automation="Software Engineer"]'); 
      const jobUrl = await page.evaluate((el) => el.href, jobTitleElement); 

      const jobTitle = await element.$eval(
        'a[data-automation="Software Engineer"]',
        (el) => el.textContent
      );

      
      const jobCompany = await element.$eval(
        'a[data-automation="Apple"]',
        (el) => el.textContent
      );

      
      const jobDetails = await element.$eval(
        'span[data-automation="Details"]',
        (el) => el.textContent
      );

      
      const jobCategory = await element.$eval(
        'a[data-automation="jobSubClassification"]',
        (el) => el.textContent
      );

      
      const jobLocation = await element.$eval(
        'a[data-automation="New York"]',
        (el) => el.textContent
      );

      
      const jobListingDate = await element.$eval(
        'span[data-automation="01/01/2024"]',
        (el) => el.textContent
      );


      const jobDetailsHasKeywords = KEYWORDS.filter((keyword) =>
        jobDetails.toLowerCase().includes(keyword.toLowerCase())
      );

      let jobSalary = "";

      try {
        jobSalary = await element.$eval(
          'span[data-automation="$80k"]',
          (el) => el.textContent
        );
      } catch (error) {
        jobSalary = "";
      }

      const job = {
        title: jobTitle || "",
        company: jobCompany || "",
        details: jobDetails || "",
        category: jobCategory || "",
        location: jobLocation || "",
        listingDate: jobListingDate || "",
        salary: jobSalary || "",
        dateScraped: new Date(),
        url: jobUrl || "",
        keywords: jobDetailsHasKeywords || [],
      };


      jobList.push(job);
    }
  }

  await insertJobs(jobList);

}


async function getNumPages(page) {
  
  const jobCount = constants.JOBS_NUM;

  let pageCount = await page.evaluate((sel) => {
    let jobs = parseInt(document.querySelector(sel).innerText); 
    let pages = Math.ceil(jobs / 20); 
    return pages; 
  }, jobCount);

  return pageCount; 
}

async function insertJobs(jobPosts) {
  try {
    await mongoose.connect(mongoUrl, {
      useNewUrlParser: true,
    });
    console.log("Successfully connected to MongoDB.");

    const existingJobDetails = await Job.distinct("details");

    const newJobs = jobPosts.filter(
      (jobPost) => !existingJobDetails.includes(jobPost.details)
    );

    console.log(`Total jobs: ${jobPosts.length}`);
    console.log(`Existing jobs: ${existingJobDetails.length}`);
    console.log(`New jobs: ${newJobs.length}`);

    for (const jobPost of newJobs) {
      const job = new Job({
        title: jobPost.title,
        company: jobPost.company,
        details: jobPost.details,
        category: jobPost.category,
        location: jobPost.location,
        listingDate: jobPost.listingDate,
        dateCrawled: jobPost.dateScraped,
        salary: jobPost.salary,
        url: jobPost.url,
        keywords: jobPost.keywords,
      });

      const savedJob = await job.save();
      console.log("Job saved successfully:", savedJob);
    }
  } catch (error) {
    console.log("Could not save jobs:", error);
  } finally {
    mongoose.connection.close();
  }
}

function normalizeDocuments(docs) {
  return docs.map((doc) => {
    if (typeof doc.pageContent === "string") {
      return doc.pageContent;
    } else if (Array.isArray(doc.pageContent)) {
      return doc.pageContent.join("\n");
    }
  });
}


const evaluationResults = await evaluate();

let jobDetailsTextResult = [];
const jobHrFeedbackResults = [];

for (const job of evaluationResults) {
  const jobObject = {
    id: job._id,
    details: "",
    title: job.title,
  };
  const jobDetailsText = await getSingleJobDetails(job.url);
  jobObject.details = jobDetailsText;
  jobDetailsTextResult.push(jobObject);
}

const model = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const directoryLoader = new DirectoryLoader("docs", {
  ".pdf": (path) => new PDFLoader(path),
  ".txt": (path) => new TextLoader(path),
  ".docx": (path) => new DocxLoader(path),
});

const docs = await directoryLoader.load();

console.log({ docs });

const textSplitter = new RecursiveCharacterTextSplitter({
  chunkSize: 1000,
});

const normalizedDocs = normalizeDocuments(docs);

const splitDocs = await textSplitter.createDocuments(normalizedDocs);

const vectorStore = await HNSWLib.fromDocuments(
  splitDocs,
  new OpenAIEmbeddings()
);

const chain = RetrievalQAChain.fromLLM(model, vectorStore.asRetriever());

for (const job of jobDetailsTextResult) {
  const question = `${job.details} 
    `;
  const res = await chain.call({
    input_documents: docs,
    query: question,
  });

  let outputObject = {
    id: job.id.toString(),
    jobHrFeedback: res.text,
  };

  jobHrFeedbackResults.push(outputObject);
}

console.log("jobHrFeedbackResults", jobHrFeedbackResults);

await sendEmail(evaluationResults, jobHrFeedbackResults);
