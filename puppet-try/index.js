const puppeteer = require('puppeteer');
const createCsvWriter = require('csv-writer').createObjectCsvWriter;
const fs = require('fs');

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function writeCSV(data, file) {
    // 示例数据
    // const data = [
    //     { url: 'someurl' },
    // ];

    // 创建 CSV 写入器
    const csvWriter = createCsvWriter({
        path: `${file}.csv`, // 指定要保存的 CSV 文件路径
        header: [
            { id: 'url', title: 'URL' }, // 列名和数据字段映射
        ],
    });

    // 写入数据到 CSV 文件
    await csvWriter.writeRecords(data)
}

(async () => {
    const browser = await puppeteer.connect({
        browserWSEndpoint: 'ws://host.docker.internal:9222/devtools/browser/312a781e-bbb1-4d1d-9a76-2fd4aa905376', // 请替换端口号
        defaultViewport: null, // 允许 Puppeteer 使用浏览器的默认视窗大小
    });
    // Create a new page in a pristine context.
    const page = await browser.newPage();
    await Promise.all([
        page.goto('https://www.linkedin.com/home'),
        page.waitForNavigation()
    ]);

    // 先看看用不用登陆
    if (await page.$('#session_key')) {
        await page.type('#session_key', 'yuwang.studio@gmail.com');
        await page.type('#session_password', '5622150');
        const loginBtn = await page.waitForSelector('button ::-p-text(Sign in)');

        await loginBtn.click();
        console.log('开始登陆')
    }

    await page.locator('div ::-p-text(Yu Wang)').wait();
    console.log('登录成功')

    await page.goto('https://www.linkedin.com/jobs/search/?currentJobId=3715320794&distance=25&f_E=4&f_TPR=r86400&f_WT=2&geoId=103644278&keywords=full%20stack%20engineer&origin=JOB_SEARCH_PAGE_JOB_FILTER&sortBy=R');
    await page.locator('li[data-test-pagination-page-btn="1"]').wait();
    console.log('进入job list页面')
    // 获取分页，记得等待页面加载完全
    const jobLinks = [];
    console.log('准备获取前十页的职位信息')
    // const buttons = await page.$$eval('button', elements => {
    //     return elements
    //         .filter(item => {
    //             return item.getAttribute('aria-label').startsWith('Page ');
    //         });
    // });
    const xpathExtractor = (x) => `//button[@aria-label='Page ${x}']`;
    let curPage = 1;
    while (curPage < 10) {
        const button = await page.$x(xpathExtractor(curPage));
        if (button.length === 0) continue;
        await button[0].click();
        await sleep(2000);

        const targets = (await page.evaluate(async () => {
            const anchors = Array.from(document.querySelectorAll('a'));
            return anchors.map(anchor => ({
                text: anchor.textContent,
                href: anchor.getAttribute('href')
            })).filter(item => item.href.startsWith('/jobs/view/'));
        }))
            .map(item => item.href);
        jobLinks.push(...targets);
        console.log(`Page ${curPage}信息提取完成`)
        curPage++;
    }
    const links = [...(new Set(jobLinks))]
    const jobUrls = [];
    // 监听tab创建的事件
    browser.on('targetcreated', async target => {
        if (target.type() === 'page') {
            const newPage = await target.page();
            const newUrl = newPage.url();

            // 在这里处理新标签页的 URL
            console.log('新标签页的 URL:', newUrl);
            jobUrls.push(newUrl);
            // 关闭新标签页
            await newPage.close();
        }
    });
    for (let href of links) {
        const url = 'https://www.linkedin.com' + href;
        await page.goto(url);
        const applyButton = await page.$x("//button[span[text()='Apply']]");
        if (applyButton.length === 0) continue; // easy apply
        await applyButton[0].click();
        await sleep(5000);
    }

    console.log(`本次一共提取${links.length}个职位链接`, { links });
    await writeCSV([...(new Set(jobUrls))].map(item => ({ url: item })), 'job-urls');
    await writeCSV(links.map(item => ({ url: item })), 'linkedin-uri');
    // 关闭page
    await page.close();
})();