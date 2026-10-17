import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const usersPagePath = path.resolve(__dirname, "../src/app/users/page.tsx");

describe("Users Management Table - Password Column Removal", () => {
  const fileContent = fs.readFileSync(usersPagePath, "utf-8");

  it("should verify users page component exists and is readable", () => {
    assert.ok(fileContent.length > 0, "Users page component must not be empty");
  });

  it("should NOT contain the Password column header in the table", () => {
    assert.strictEqual(
      fileContent.includes('<th className="py-3 px-3">Password</th>'),
      false,
      "Table header should not contain a Password column",
    );
    assert.strictEqual(
      fileContent.includes("<th>Password</th>"),
      false,
      "Table header should not contain any <th>Password</th> tag",
    );
  });

  it("should NOT display 'Cannot be viewed' in the table rows", () => {
    assert.strictEqual(
      fileContent.includes("Cannot be viewed"),
      false,
      "Users table rows should not display 'Cannot be viewed'",
    );
  });

  it("should NOT display the Reset button in the table rows", () => {
    assert.strictEqual(
      fileContent.includes("handleOpenResetModal"),
      false,
      "Users table rows should not bind handleOpenResetModal",
    );
    // Ensure no reset button in user table row
    const hasRowResetButton = /<td[^>]*>[\s\S]*?<Button[^>]*>[\s\S]*?Reset[\s\S]*?<\/Button>[\s\S]*?<\/td>/.test(
      fileContent,
    );
    assert.strictEqual(
      hasRowResetButton,
      false,
      "Users table rows should not contain any Reset button",
    );
  });

  it("should NOT contain the Password Security Information dialog in UsersPage", () => {
    assert.strictEqual(
      fileContent.includes("passwordInfoUser"),
      false,
      "UsersPage should not retain passwordInfoUser state or dialog",
    );
    assert.strictEqual(
      fileContent.includes("Password Security & Protection"),
      false,
      "UsersPage should not render Password Security & Protection dialog",
    );
  });

  it("should retain all 7 required columns: Name, Email, Phone, Role, Status, Joined, Actions", () => {
    const requiredHeaders = [
      "Name",
      "Email",
      "Phone",
      "Role",
      "Status",
      "Joined",
      "Actions",
    ];

    for (const header of requiredHeaders) {
      assert.ok(
        fileContent.includes(`>${header}</th>`),
        `Table header must retain column "${header}"`,
      );
    }
  });

  it("should retain Edit, activate/deactivate, and Delete actions", () => {
    assert.ok(
      fileContent.includes("handleOpenEditModal"),
      "Row actions must retain handleOpenEditModal for editing",
    );
    assert.ok(
      fileContent.includes("toggleStatusMutation"),
      "Row actions must retain toggleStatusMutation for activate/deactivate",
    );
    assert.ok(
      fileContent.includes("handleOpenDeleteModal"),
      "Row actions must retain handleOpenDeleteModal for deleting",
    );
  });

  it("should maintain a responsive min-width on the table", () => {
    assert.ok(
      fileContent.includes("min-w-[760px]") || fileContent.includes("min-w-[800px]"),
      "Table should maintain a responsive min-width",
    );
  });
});
