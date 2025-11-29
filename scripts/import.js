"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const csv_parser_1 = __importDefault(require("csv-parser"));
const prisma = new client_1.PrismaClient();
// --- CONFIGURATION ---
const headerMapping = {
    profileLink: ['Profile Link', 'profile_link', 'ProfileLink'],
    nickname: ['Nickname', 'nick'],
    username: ['Username', 'user_name'],
    country: ['Country', 'country_name', 'Region'],
    email: ['Email', 'email_address'],
    instagram: ['Instagram', 'ig'],
    youtube: ['Youtube', 'yt'],
    followers: ['Followers', 'followers_count'],
    posts: ['Posts', 'posts_count'],
    likes: ['Likes', 'likes_count'],
    bio: ['Bio', 'biography'],
};
// --- HELPER FUNCTION to normalize a single row ---
function normalizeRow(row) {
    const normalized = {};
    for (const cleanKey in headerMapping) {
        const possibleHeaders = headerMapping[cleanKey];
        for (const header of possibleHeaders) {
            if (row[header] !== undefined) {
                normalized[cleanKey] = row[header];
                break;
            }
        }
    }
    return normalized;
}
// --- HELPER FUNCTION to validate email ---
function isValidEmail(email) {
    if (!email)
        return false;
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
}
// --- MAIN IMPORT FUNCTION ---
async function main() {
    console.log('Starting CSV import process...');
    // --- IMPROVEMENT 1: Fetch already migrated files ---
    console.log('Fetching list of already migrated files...');
    const migrated = await prisma.migratedFiles.findMany({
        select: { fileName: true },
    });
    // Use a Set for efficient O(1) lookups
    const migratedFileNames = new Set(migrated.map((f) => f.fileName));
    console.log(`Found ${migratedFileNames.size} migrated files to skip.`);
    const dataDir = path_1.default.join(__dirname, '..', 'data');
    const allFiles = fs_1.default.readdirSync(dataDir).filter((file) => file.endsWith('.csv'));
    // --- IMPROVEMENT 2: Filter out files that have already been processed ---
    const filesToProcess = allFiles.filter((file) => !migratedFileNames.has(file));
    if (filesToProcess.length === 0) {
        console.log('No new CSV files to process.');
        return;
    }
    console.log(`Found ${filesToProcess.length} new files to process.`);
    // A cache to avoid querying the same region multiple times
    const regionCache = {};
    const BATCH_SIZE = 1000; // Configurable batch size for inserts
    let creatorsToInsert = [];
    for (const file of filesToProcess) {
        console.log(`Processing file: ${file}...`);
        const filePath = path_1.default.join(dataDir, file);
        const jsonData = [];
        // 1. PARSE CSV to JSON
        await new Promise((resolve, reject) => {
            fs_1.default.createReadStream(filePath)
                .pipe((0, csv_parser_1.default)())
                .on('data', (row) => {
                const normalized = normalizeRow(row);
                if (normalized.profileLink || normalized.username) {
                    jsonData.push(normalized);
                }
            })
                .on('end', () => {
                console.log(`Finished parsing ${jsonData.length} rows from ${file}.`);
                resolve();
            })
                .on('error', reject);
        });
        // 2. PREPARE DATA for insertion
        for (const creator of jsonData) {
            let country = creator.country?.trim() || '';
            let email = creator.email;
            if (country && country.length > 3) {
                email = isValidEmail(country) ? country : null;
                country = 'world';
            }
            if (!country) {
                continue;
            }
            let regionId = regionCache[country];
            if (!regionId) {
                let region = await prisma.region.findUnique({
                    where: { name: country },
                });
                if (!region) {
                    region = await prisma.region.create({
                        data: { name: country },
                    });
                    console.log(`Created new region: ${country}`);
                }
                regionCache[country] = region.id;
                regionId = region.id;
            }
            creatorsToInsert.push({
                profileLink: creator.profileLink || '',
                nickname: creator.nickname,
                username: creator.username || '',
                country: country,
                email: email,
                instagram: creator.instagram,
                youtube: creator.youtube,
                followers: parseInt(creator.followers) || 0,
                posts: parseInt(creator.posts) || 0,
                likes: parseInt(creator.likes) || 0,
                bio: creator.bio,
                regionId: regionId,
            });
            // 3. BATCH INSERT when batch size is reached
            if (creatorsToInsert.length >= BATCH_SIZE) {
                console.log(`Inserting batch of ${creatorsToInsert.length} creators...`);
                const result = await prisma.contentCreator.createMany({
                    data: creatorsToInsert,
                    skipDuplicates: true,
                });
                console.log(`Successfully inserted ${result.count} creators in batch.`);
                creatorsToInsert = []; // Clear the batch
            }
        }
        // --- IMPROVEMENT 3: Mark the file as migrated after it has been fully processed ---
        await prisma.migratedFiles.create({
            data: {
                fileName: file,
                filePath: file, // Using filename as path as per previous request
            },
        });
        console.log(`Successfully marked '${file}' as migrated.`);
    }
    // 4. INSERT REMAINING DATA from the last file
    if (creatorsToInsert.length > 0) {
        console.log(`Inserting final batch of ${creatorsToInsert.length} creators...`);
        const result = await prisma.contentCreator.createMany({
            data: creatorsToInsert,
            skipDuplicates: true,
        });
        console.log(`Successfully inserted ${result.count} creators in final batch.`);
    }
    else {
        console.log('No new creators to insert in the final batch.');
    }
}
// --- EXECUTE SCRIPT ---
main()
    .catch((e) => {
    console.error('An error occurred during the import process:');
    console.error(e);
})
    .finally(async () => {
    await prisma.$disconnect();
    console.log('Import process finished. Disconnected from database.');
});
