# Clinical Trials MCP Server - 快速开始指南

## 🚀 使用 npx 快速启动（推荐）

### 配置方法

在 Cursor / Cherry Studio 的 MCP 配置文件中添加：

```json
{
  "mcpServers": {
    "clinical-trials": {
      "command": "npx",
      "args": ["-y", "clinical-trials-server"]
    }
  }
}
```

### 说明

- 无需手动安装依赖
- `npx` 会自动从 npm 下载并运行最新版本
- `-y` 参数跳过确认提示，实现无人值守启动

---

## 📦 从 npm 安装

如果你想全局安装：

```bash
npm install -g clinical-trials-server
```

安装后可直接使用：

```bash
clinical-trials-server
```

---

## 🔬 可用工具（18 个）

### 核心搜索工具（6 个）

1. **search_studies** - 通用搜索（条件、干预、位置、阶段、状态）
2. **get_study_details** - 通过 NCT ID 获取详细信息
3. **search_by_condition** - 按疾病条件搜索
4. **search_by_location** - 按地理位置搜索
5. **search_by_sponsor** - 按赞助商搜索
6. **search_by_intervention** - 按治疗干预搜索

### 专业搜索工具（6 个）

7. **get_recruiting_studies** - 正在招募的试验
8. **search_by_date_range** - 按日期范围搜索
9. **get_studies_with_results** - 已发布结果的试验
10. **search_rare_diseases** - 罕见病试验搜索
11. **get_pediatric_studies** - 儿科试验搜索
12. **search_international_studies** - 国际多中心试验

### 高级分析工具（6 个）

13. **get_similar_studies** - 查找相似试验
14. **search_by_primary_outcome** - 按主要结局搜索
15. **search_by_eligibility_criteria** - 按入选标准搜索
16. **get_study_timeline** - 时间线分析
17. **get_trial_statistics** - 统计分析
18. **search_by_keyword** - 关键词搜索

---

## 💡 使用示例

### 搜索癌症试验

```json
{
  "tool": "search_studies",
  "arguments": {
    "condition": "cancer",
    "phase": "PHASE3",
    "status": "RECRUITING",
    "pageSize": 10
  }
}
```

### 获取详细研究信息

```json
{
  "tool": "get_study_details",
  "arguments": {
    "nctId": "NCT05882279"
  }
}
```

### 按位置查找试验

```json
{
  "tool": "search_by_location",
  "arguments": {
    "country": "United States",
    "city": "Boston",
    "distance": 50,
    "pageSize": 5
  }
}
```

### 搜索儿科研究

```json
{
  "tool": "get_pediatric_studies",
  "arguments": {
    "condition": "diabetes",
    "ageRange": "CHILD",
    "recruitmentStatus": "RECRUITING"
  }
}
```

### 获取试验统计

```json
{
  "tool": "get_trial_statistics",
  "arguments": {
    "groupBy": "phase",
    "filters": {
      "condition": "diabetes",
      "status": "RECRUITING"
    }
  }
}
```

---

## 📝 常用参数

### 搜索参数

- `pageSize` - 结果数量 (1-100, 默认: 10)
- `condition` - 疾病或病症
- `phase` - 研究阶段: PHASE1, PHASE2, PHASE3, PHASE4, NA
- `status` - 招募状态: RECRUITING, COMPLETED, etc.

### 位置参数

- `country` - 国家名称
- `state` - 州或省
- `city` - 城市名称
- `distance` - 搜索半径（英里，1-500）

### 资格参数

- `sex` - ALL, FEMALE, MALE
- `age` - CHILD, ADULT, OLDER_ADULT
- `minAge/maxAge` - 年龄范围（例如 "18 Years", "65 Years"）
- `healthyVolunteers` - 是否接受健康志愿者

---

## 📊 数据来源

- **API 端点**: https://clinicaltrials.gov/api/v2
- **数据更新**: 周一至周五（节假日除外）
- **覆盖范围**: 400,000+ 研究，来自 220+ 个国家
- **数据质量**: FDA/NIH 官方注册，信息经过验证

---

## 📝 版本信息

- **当前版本**: 0.1.0
- **npm 地址**: https://www.npmjs.com/package/clinical-trials-server
- **源码地址**: https://github.com/augmented-nature/clinical-trials-mcp-server
- **开发者**: Augmented Nature

---

## ⚠️ 注意事项

1. **NCT ID 格式**: 必须遵循格式 `NCT########`（NCT 后跟 8 位数字）
2. **超时保护**: 服务器有 30 秒超时保护
3. **数据使用**: 遵循机构政策和患者隐私保护
4. **引用来源**: 在出版物中引用 ClinicalTrials.gov
5. **API 限制**: 大型结果集可能需要较长处理时间

---

## 🔧 临床研究用例

- **患者招募**: 为特定疾病查找正在招募的试验
- **竞争分析**: 研究赞助商或干预措施的相似研究
- **站点选择**: 识别新研究的最佳位置
- **监管研究**: 访问 FDA 批准的研究方案和结果
- **学术研究**: 分析临床试验趋势和统计数据
- **患者护理**: 帮助患者找到合适的治疗选择

---

## 📄 许可证

MIT License - 查看 LICENSE 文件了解详情

---

**数据来源**: ClinicalTrials.gov (https://clinicaltrials.gov)  
**API 文档**: https://clinicaltrials.gov/data-api/api  
**服务器版本**: 0.1.0
