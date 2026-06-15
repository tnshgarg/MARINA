"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * GitHub sync verifier. Proves the NEW org-repo discovery actually pulls
 * commits from a (possibly PRIVATE) tracked org — the exact logic the app's
 * sync now uses. Run with a token that can see the org:
 *
 *   GITHUB_TOKEN=ghp_xxx GH_ORG=marina-dummy pnpm tsx scripts/gh-verify.ts
 *
 * A classic PAT needs `repo` + `read:org` scope to see private org repos.
 * The token can be a fine-grained PAT scoped to the marina-dummy org with
 * "Contents: read" + "Metadata: read".
 */
var rest_1 = require("@octokit/rest");
function main() {
    return __awaiter(this, void 0, void 0, function () {
        var token, org, octokit, me, since, repos, e_1, total, _i, repos_1, r, commits, _a, _b, c, cc, e_2;
        var _c, _d, _e, _f, _g, _h, _j;
        return __generator(this, function (_k) {
            switch (_k.label) {
                case 0:
                    token = process.env.GITHUB_TOKEN;
                    org = (_c = process.env.GH_ORG) !== null && _c !== void 0 ? _c : 'marina-dummy';
                    if (!token) {
                        console.error('Set GITHUB_TOKEN (classic PAT with repo+read:org, or a fine-grained PAT for the org).');
                        process.exit(1);
                    }
                    octokit = new rest_1.Octokit({ auth: token });
                    return [4 /*yield*/, octokit.users.getAuthenticated()];
                case 1:
                    me = _k.sent();
                    console.log("\u2713 Authenticated as @".concat(me.data.login));
                    since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
                    repos = [];
                    _k.label = 2;
                case 2:
                    _k.trys.push([2, 4, , 6]);
                    return [4 /*yield*/, octokit.paginate(octokit.repos.listForOrg, { org: org, type: 'all', sort: 'pushed', per_page: 100 })];
                case 3:
                    repos = (_k.sent());
                    console.log("\u2713 Listed ".concat(repos.length, " repos in org \"").concat(org, "\":"), repos.map(function (r) { return "".concat(r.name).concat(r.private ? ' (private)' : ''); }).join(', ') || '(none)');
                    return [3 /*break*/, 6];
                case 4:
                    e_1 = _k.sent();
                    console.log("\u00B7 \"".concat(org, "\" is not an org or token can't list it (").concat(e_1.message, "); trying as a user account\u2026"));
                    return [4 /*yield*/, octokit.paginate(octokit.repos.listForUser, { username: org, type: 'all', sort: 'pushed', per_page: 100 })];
                case 5:
                    repos = (_k.sent());
                    console.log("\u2713 Listed ".concat(repos.length, " repos for user \"").concat(org, "\""));
                    return [3 /*break*/, 6];
                case 6:
                    if (repos.length === 0) {
                        console.log('\n✗ No repos visible. The token cannot see this org\'s repos.');
                        console.log('  Fix in the real app: the org admin must AUTHORIZE the MARINA OAuth app');
                        console.log('  (github.com → org → Settings → Third-party Access → grant the app), and the');
                        console.log('  user must RECONNECT GitHub so the new `read:org` scope is granted.');
                        process.exit(0);
                    }
                    total = 0;
                    _i = 0, repos_1 = repos;
                    _k.label = 7;
                case 7:
                    if (!(_i < repos_1.length)) return [3 /*break*/, 12];
                    r = repos_1[_i];
                    if (r.pushed_at && new Date(r.pushed_at) < new Date(since))
                        return [3 /*break*/, 11];
                    _k.label = 8;
                case 8:
                    _k.trys.push([8, 10, , 11]);
                    return [4 /*yield*/, octokit.paginate(octokit.repos.listCommits, {
                            owner: org,
                            repo: r.name,
                            since: since,
                            per_page: 100,
                        })];
                case 9:
                    commits = _k.sent();
                    if (commits.length > 0) {
                        console.log("\n  ".concat(org, "/").concat(r.name, " \u2014 ").concat(commits.length, " commit(s) in last 30d:"));
                        for (_a = 0, _b = commits.slice(0, 10); _a < _b.length; _a++) {
                            c = _b[_a];
                            cc = c;
                            console.log("    \u2022 ".concat(cc.sha.slice(0, 7), "  ").concat(((_e = (_d = cc.commit) === null || _d === void 0 ? void 0 : _d.message) !== null && _e !== void 0 ? _e : '').split('\n')[0].slice(0, 60), "  \u2014 @").concat((_g = (_f = cc.author) === null || _f === void 0 ? void 0 : _f.login) !== null && _g !== void 0 ? _g : (_j = (_h = cc.commit) === null || _h === void 0 ? void 0 : _h.author) === null || _j === void 0 ? void 0 : _j.email));
                        }
                        total += commits.length;
                    }
                    return [3 /*break*/, 11];
                case 10:
                    e_2 = _k.sent();
                    console.log("    (couldn't read commits for ".concat(r.name, ": ").concat(e_2.message, ")"));
                    return [3 /*break*/, 11];
                case 11:
                    _i++;
                    return [3 /*break*/, 7];
                case 12:
                    console.log("\n\u2713 DONE \u2014 ".concat(total, " commit(s) the app would track across \"").concat(org, "\". If you see your test-web commit above, the sync works."));
                    process.exit(0);
                    return [2 /*return*/];
            }
        });
    });
}
main().catch(function (e) {
    console.error('verify failed:', e);
    process.exit(1);
});
