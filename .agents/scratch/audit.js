const fs = require("fs");
const path = require("path");
const srcDir = "d:/AntiGravity/Projects/PigmieFinance/pigmie-api/src";
let issues = [];

function checkFile(filePath) {
    if (!fs.existsSync(filePath)) return;
    const code = fs.readFileSync(filePath, "utf-8");
    const lines = code.split("\n");
    const ext = path.extname(filePath);
    const fileName = path.basename(filePath);
    
    // Check DTOs
    if (filePath.includes("/dto/") && ext === ".ts") {
        let inClass = false;
        lines.forEach((line, i) => {
            if (line.includes("class ")) inClass = true;
            if (inClass && line.match(/^\s+\w+(\?)?:/) && !line.includes("(")) {
                const prevLines = lines.slice(Math.max(0, i-3), i).join(" ");
                if (!prevLines.includes("@Is") && !prevLines.includes("@Type") && !prevLines.includes("@Validate") && !prevLines.includes("@ApiProperty")) {
                    // issues.push(filePath + ":" + (i+1) + " - DTO missing validation decorator: " + line.trim());
                }
            }
        });
    }

    if (filePath.includes(".controller.ts")) {
        let hasAuthGuard = code.includes("JwtAuthGuard") || code.includes("AuthGuard");
        let isPublic = code.includes("@Public()");
        if (!hasAuthGuard && !isPublic) {
            issues.push(filePath + ":1 - Controller missing JwtAuthGuard.");
        }
        lines.forEach((line, i) => {
           if (line.includes("@Get(") || line.includes("@Post(") || line.includes("@Patch(") || line.includes("@Delete(")) {
               const block = lines.slice(Math.max(0, i-3), i).join(" ");
               if (!block.includes("@Roles") && !block.includes("@Permissions") && !code.includes("@Public()")) {
                   issues.push(filePath + ":" + (i+1) + " - Endpoint might be missing @Roles or @Permissions.");
               }
           }
        });
    }

    if (filePath.includes(".service.ts")) {
        lines.forEach((line, i) => {
            if (line.match(/this\.prisma\.\w+\.(findMany|findUnique|findFirst|update|delete|count)\(/)) {
                const block = lines.slice(i, i+15).join(" ");
                if (!block.includes("organizationId") && !block.includes("where: { id") && !filePath.includes("auth.service") && !filePath.includes("staff.service")) {
                    issues.push(filePath + ":" + (i+1) + " - Prisma query might be missing organizationId scoping.");
                }
            }
            if (line.includes("$queryRaw") || line.includes("$executeRaw")) {
                const block = lines.slice(i, i+10).join(" ");
                if (block.match(/([a-z]+[A-Z][a-z]+)/) && !block.includes("organization_id")) {
                    issues.push(filePath + ":" + (i+1) + " - Raw SQL query might have camelCase columns instead of snake_case or missing org id.");
                }
            }
            if (line.includes("catch (") || line.includes("catch(")) {
                const block = lines.slice(i, i+5).join(" ");
                if (!block.includes("throw ") && !block.includes("Logger")) {
                    issues.push(filePath + ":" + (i+1) + " - Empty or non-throwing catch block in service.");
                }
            }
        });
    }
}

function walkDir(dir) {
    if (!fs.existsSync(dir)) return;
    const files = fs.readdirSync(dir);
    for (const file of files) {
        const fullPath = path.join(dir, file);
        if (fs.statSync(fullPath).isDirectory()) {
            walkDir(fullPath);
        } else {
            if (fullPath.endsWith(".ts")) checkFile(fullPath);
        }
    }
}

walkDir(srcDir);
console.log(issues.join("\n"));

