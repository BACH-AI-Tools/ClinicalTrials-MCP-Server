#!/usr/bin/env node

/**
 * Clinical Trials MCP Server
 * 
 * This MCP server provides tools to search and retrieve clinical trial data from ClinicalTrials.gov.
 * It offers comprehensive access to trial information including study details, locations, 
 * eligibility criteria, outcomes, and more.
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from "@modelcontextprotocol/sdk/types.js";
import axios, { AxiosResponse } from "axios";

// Base URL for Clinical Trials API
const API_BASE_URL = 'https://clinicaltrials.gov/api/v2';

// Interfaces for API responses
interface StudySearchResponse {
  studies: Study[];
  totalCount: number;
  nextPageToken?: string;
}

interface Study {
  protocolSection: {
    identificationModule: {
      nctId: string;
      briefTitle: string;
      officialTitle?: string;
    };
    statusModule: {
      overallStatus: string;
      startDateStruct?: {
        date: string;
        type: string;
      };
      primaryCompletionDateStruct?: {
        date: string;
        type: string;
      };
    };
    sponsorCollaboratorsModule?: {
      leadSponsor: {
        name: string;
        class: string;
      };
    };
    conditionsModule?: {
      conditions: string[];
    };
    designModule?: {
      phases?: string[];
      studyType: string;
    };
    contactsLocationsModule?: {
      locations?: Array<{
        facility: string;
        city: string;
        state?: string;
        country: string;
      }>;
    };
    eligibilityModule?: {
      eligibilityCriteria: string;
      healthyVolunteers: boolean;
      sex: string;
      minimumAge?: string;
      maximumAge?: string;
    };
  };
}

interface StudyDetailResponse {
  studies: Study[];
}

class ClinicalTrialsServer {
  private server: Server;
  private axiosInstance;

  constructor() {
    this.server = new Server(
      {
        name: "clinical-trials-server",
        version: "0.1.0",
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    // Create axios instance with default configuration
    this.axiosInstance = axios.create({
      baseURL: API_BASE_URL,
      timeout: 30000,
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'ClinicalTrials-MCP-Server/0.1.0',
      },
    });

    this.setupToolHandlers();
    
    // Error handling
    this.server.onerror = (error) => console.error('[MCP Error]', error);
    process.on('SIGINT', async () => {
      await this.server.close();
      process.exit(0);
    });
  }

  private setupToolHandlers() {
    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: 'search_studies',
          description: 'Search for clinical trials with various filters',
          inputSchema: {
            type: 'object',
            properties: {
              query: {
                type: 'string',
                description: 'General search term (condition, intervention, etc.)'
              },
              condition: {
                type: 'string',
                description: 'Medical condition or disease'
              },
              intervention: {
                type: 'string',
                description: 'Treatment, drug, or intervention'
              },
              location: {
                type: 'string',
                description: 'Geographic location (city, state, country)'
              },
              phase: {
                type: 'string',
                description: 'Study phase (PHASE1, PHASE2, PHASE3, PHASE4, NA)',
                enum: ['PHASE1', 'PHASE2', 'PHASE3', 'PHASE4', 'NA']
              },
              status: {
                type: 'string',
                description: 'Recruitment status',
                enum: ['RECRUITING', 'NOT_YET_RECRUITING', 'COMPLETED', 'TERMINATED', 'SUSPENDED', 'WITHDRAWN']
              },
              sex: {
                type: 'string',
                description: 'Sex eligibility',
                enum: ['ALL', 'FEMALE', 'MALE']
              },
              age: {
                type: 'string',
                description: 'Age group',
                enum: ['CHILD', 'ADULT', 'OLDER_ADULT']
              },
              pageSize: {
                type: 'number',
                description: 'Number of results to return (default 10, max 100)',
                minimum: 1,
                maximum: 100
              }
            }
          }
        },
        {
          name: 'get_study_details',
          description: 'Get detailed information about a specific clinical trial',
          inputSchema: {
            type: 'object',
            properties: {
              nctId: {
                type: 'string',
                description: 'NCT ID of the study (e.g., NCT00000419)',
                pattern: '^NCT\\d{8}$'
              }
            },
            required: ['nctId']
          }
        },
        {
          name: 'search_by_location',
          description: 'Find clinical trials by geographic location',
          inputSchema: {
            type: 'object',
            properties: {
              country: {
                type: 'string',
                description: 'Country name'
              },
              state: {
                type: 'string',
                description: 'State or province'
              },
              city: {
                type: 'string',
                description: 'City name'
              },
              facilityName: {
                type: 'string',
                description: 'Name of medical facility or institution'
              },
              distance: {
                type: 'number',
                description: 'Search radius in miles (when using city)',
                minimum: 1,
                maximum: 500
              },
              pageSize: {
                type: 'number',
                description: 'Number of results to return (default 10, max 100)',
                minimum: 1,
                maximum: 100
              }
            }
          }
        },
        {
          name: 'search_by_condition',
          description: 'Search for clinical trials focusing on specific medical conditions',
          inputSchema: {
            type: 'object',
            properties: {
              condition: {
                type: 'string',
                description: 'Medical condition, disease, or syndrome',
                minLength: 2
              },
              phase: {
                type: 'string',
                description: 'Study phase filter',
                enum: ['PHASE1', 'PHASE2', 'PHASE3', 'PHASE4', 'NA']
              },
              recruitmentStatus: {
                type: 'string',
                description: 'Filter by recruitment status',
                enum: ['RECRUITING', 'NOT_YET_RECRUITING', 'ACTIVE_NOT_RECRUITING']
              },
              pageSize: {
                type: 'number',
                description: 'Number of results to return (default 10, max 100)',
                minimum: 1,
                maximum: 100
              }
            },
            required: ['condition']
          }
        },
        {
          name: 'get_trial_statistics',
          description: 'Get aggregate statistics about clinical trials',
          inputSchema: {
            type: 'object',
            properties: {
              groupBy: {
                type: 'string',
                description: 'Field to group statistics by',
                enum: ['phase', 'status', 'studyType', 'condition', 'sponsor']
              },
              filters: {
                type: 'object',
                description: 'Optional filters to apply',
                properties: {
                  condition: { type: 'string' },
                  phase: { type: 'string' },
                  status: { type: 'string' }
                }
              }
            }
          }
        },
        {
          name: 'search_by_sponsor',
          description: 'Search clinical trials by sponsor or organization',
          inputSchema: {
            type: 'object',
            properties: {
              sponsor: {
                type: 'string',
                description: 'Sponsor name or organization (e.g., "Pfizer", "National Cancer Institute")',
                minLength: 2
              },
              sponsorType: {
                type: 'string',
                description: 'Type of sponsor',
                enum: ['INDUSTRY', 'NIH', 'FED', 'OTHER']
              },
              pageSize: {
                type: 'number',
                description: 'Number of results to return (default 10, max 100)',
                minimum: 1,
                maximum: 100
              }
            },
            required: ['sponsor']
          }
        },
        {
          name: 'search_by_intervention',
          description: 'Search clinical trials by intervention or treatment type',
          inputSchema: {
            type: 'object',
            properties: {
              intervention: {
                type: 'string',
                description: 'Intervention, drug, device, or treatment name',
                minLength: 2
              },
              interventionType: {
                type: 'string',
                description: 'Type of intervention',
                enum: ['DRUG', 'DEVICE', 'BIOLOGICAL', 'PROCEDURE', 'BEHAVIORAL', 'OTHER']
              },
              phase: {
                type: 'string',
                description: 'Study phase filter',
                enum: ['PHASE1', 'PHASE2', 'PHASE3', 'PHASE4', 'NA']
              },
              pageSize: {
                type: 'number',
                description: 'Number of results to return (default 10, max 100)',
                minimum: 1,
                maximum: 100
              }
            },
            required: ['intervention']
          }
        },
        {
          name: 'get_recruiting_studies',
          description: 'Get currently recruiting clinical trials with contact information',
          inputSchema: {
            type: 'object',
            properties: {
              condition: {
                type: 'string',
                description: 'Medical condition to filter by'
              },
              location: {
                type: 'string',
                description: 'Geographic location (city, state, country)'
              },
              ageGroup: {
                type: 'string',
                description: 'Age group eligibility',
                enum: ['CHILD', 'ADULT', 'OLDER_ADULT']
              },
              pageSize: {
                type: 'number',
                description: 'Number of results to return (default 10, max 50)',
                minimum: 1,
                maximum: 50
              }
            }
          }
        },
        {
          name: 'search_by_date_range',
          description: 'Search clinical trials by start or completion date range',
          inputSchema: {
            type: 'object',
            properties: {
              startDateFrom: {
                type: 'string',
                description: 'Start date from (YYYY-MM-DD format)',
                pattern: '^\\d{4}-\\d{2}-\\d{2}$'
              },
              startDateTo: {
                type: 'string',
                description: 'Start date to (YYYY-MM-DD format)',
                pattern: '^\\d{4}-\\d{2}-\\d{2}$'
              },
              completionDateFrom: {
                type: 'string',
                description: 'Primary completion date from (YYYY-MM-DD format)',
                pattern: '^\\d{4}-\\d{2}-\\d{2}$'
              },
              completionDateTo: {
                type: 'string',
                description: 'Primary completion date to (YYYY-MM-DD format)',
                pattern: '^\\d{4}-\\d{2}-\\d{2}$'
              },
              condition: {
                type: 'string',
                description: 'Optional condition filter'
              },
              pageSize: {
                type: 'number',
                description: 'Number of results to return (default 10, max 100)',
                minimum: 1,
                maximum: 100
              }
            }
          }
        },
        {
          name: 'get_studies_with_results',
          description: 'Find completed clinical trials that have published results',
          inputSchema: {
            type: 'object',
            properties: {
              condition: {
                type: 'string',
                description: 'Medical condition to filter by'
              },
              intervention: {
                type: 'string',
                description: 'Treatment or intervention to filter by'
              },
              completedAfter: {
                type: 'string',
                description: 'Find studies completed after this date (YYYY-MM-DD)',
                pattern: '^\\d{4}-\\d{2}-\\d{2}$'
              },
              pageSize: {
                type: 'number',
                description: 'Number of results to return (default 10, max 100)',
                minimum: 1,
                maximum: 100
              }
            }
          }
        },
        {
          name: 'search_rare_diseases',
          description: 'Search clinical trials for rare diseases and orphan conditions',
          inputSchema: {
            type: 'object',
            properties: {
              rareDisease: {
                type: 'string',
                description: 'Rare disease or orphan condition name',
                minLength: 2
              },
              recruitmentStatus: {
                type: 'string',
                description: 'Filter by recruitment status',
                enum: ['RECRUITING', 'NOT_YET_RECRUITING', 'COMPLETED']
              },
              pageSize: {
                type: 'number',
                description: 'Number of results to return (default 10, max 100)',
                minimum: 1,
                maximum: 100
              }
            },
            required: ['rareDisease']
          }
        },
        {
          name: 'get_pediatric_studies',
          description: 'Find clinical trials specifically designed for children and adolescents',
          inputSchema: {
            type: 'object',
            properties: {
              condition: {
                type: 'string',
                description: 'Pediatric condition or disease'
              },
              ageRange: {
                type: 'string',
                description: 'Specific pediatric age range',
                enum: ['INFANT', 'CHILD', 'ADOLESCENT']
              },
              recruitmentStatus: {
                type: 'string',
                description: 'Filter by recruitment status',
                enum: ['RECRUITING', 'NOT_YET_RECRUITING', 'ACTIVE_NOT_RECRUITING']
              },
              pageSize: {
                type: 'number',
                description: 'Number of results to return (default 10, max 50)',
                minimum: 1,
                maximum: 50
              }
            }
          }
        },
        {
          name: 'get_similar_studies',
          description: 'Find clinical trials similar to a specific study by NCT ID',
          inputSchema: {
            type: 'object',
            properties: {
              nctId: {
                type: 'string',
                description: 'NCT ID of the reference study (e.g., NCT00000419)',
                pattern: '^NCT\\d{8}$'
              },
              similarityType: {
                type: 'string',
                description: 'Type of similarity to search for',
                enum: ['CONDITION', 'INTERVENTION', 'SPONSOR', 'PHASE'],
                default: 'CONDITION'
              },
              pageSize: {
                type: 'number',
                description: 'Number of results to return (default 10, max 50)',
                minimum: 1,
                maximum: 50
              }
            },
            required: ['nctId']
          }
        },
        {
          name: 'search_by_primary_outcome',
          description: 'Search clinical trials by primary outcome measures or endpoints',
          inputSchema: {
            type: 'object',
            properties: {
              outcome: {
                type: 'string',
                description: 'Primary outcome or endpoint to search for',
                minLength: 3
              },
              condition: {
                type: 'string',
                description: 'Optional condition filter'
              },
              phase: {
                type: 'string',
                description: 'Study phase filter',
                enum: ['PHASE1', 'PHASE2', 'PHASE3', 'PHASE4', 'NA']
              },
              pageSize: {
                type: 'number',
                description: 'Number of results to return (default 10, max 100)',
                minimum: 1,
                maximum: 100
              }
            },
            required: ['outcome']
          }
        },
        {
          name: 'search_by_eligibility_criteria',
          description: 'Advanced search based on detailed eligibility criteria',
          inputSchema: {
            type: 'object',
            properties: {
              minAge: {
                type: 'string',
                description: 'Minimum age (e.g., "18 Years", "6 Months")'
              },
              maxAge: {
                type: 'string',
                description: 'Maximum age (e.g., "65 Years", "12 Years")'
              },
              sex: {
                type: 'string',
                description: 'Sex eligibility',
                enum: ['ALL', 'FEMALE', 'MALE']
              },
              healthyVolunteers: {
                type: 'boolean',
                description: 'Whether study accepts healthy volunteers'
              },
              condition: {
                type: 'string',
                description: 'Medical condition filter'
              },
              exclusionKeywords: {
                type: 'string',
                description: 'Keywords that should NOT appear in eligibility criteria'
              },
              inclusionKeywords: {
                type: 'string',
                description: 'Keywords that should appear in eligibility criteria'
              },
              pageSize: {
                type: 'number',
                description: 'Number of results to return (default 10, max 100)',
                minimum: 1,
                maximum: 100
              }
            }
          }
        },
        {
          name: 'get_study_timeline',
          description: 'Get detailed timeline and milestone information for studies',
          inputSchema: {
            type: 'object',
            properties: {
              condition: {
                type: 'string',
                description: 'Condition to filter studies'
              },
              sponsor: {
                type: 'string',
                description: 'Sponsor to filter studies'
              },
              phase: {
                type: 'string',
                description: 'Study phase filter',
                enum: ['PHASE1', 'PHASE2', 'PHASE3', 'PHASE4', 'NA']
              },
              timelineType: {
                type: 'string',
                description: 'Type of timeline analysis',
                enum: ['CURRENT', 'COMPLETED', 'UPCOMING'],
                default: 'CURRENT'
              },
              pageSize: {
                type: 'number',
                description: 'Number of results to return (default 10, max 50)',
                minimum: 1,
                maximum: 50
              }
            }
          }
        },
        {
          name: 'search_international_studies',
          description: 'Find multi-country international clinical trials',
          inputSchema: {
            type: 'object',
            properties: {
              condition: {
                type: 'string',
                description: 'Medical condition to filter by'
              },
              excludeCountry: {
                type: 'string',
                description: 'Country to exclude from results (e.g., "United States")'
              },
              includeCountry: {
                type: 'string',
                description: 'Country that must be included in results'
              },
              minCountries: {
                type: 'number',
                description: 'Minimum number of countries involved',
                minimum: 2,
                maximum: 50
              },
              phase: {
                type: 'string',
                description: 'Study phase filter',
                enum: ['PHASE1', 'PHASE2', 'PHASE3', 'PHASE4', 'NA']
              },
              pageSize: {
                type: 'number',
                description: 'Number of results to return (default 10, max 100)',
                minimum: 1,
                maximum: 100
              }
            }
          }
        }
      ]
    }));

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      try {
        switch (request.params.name) {
          case 'search_studies':
            return await this.handleSearchStudies(request.params.arguments);
          case 'get_study_details':
            return await this.handleGetStudyDetails(request.params.arguments);
          case 'search_by_location':
            return await this.handleSearchByLocation(request.params.arguments);
          case 'search_by_condition':
            return await this.handleSearchByCondition(request.params.arguments);
          case 'get_trial_statistics':
            return await this.handleGetTrialStatistics(request.params.arguments);
          case 'search_by_sponsor':
            return await this.handleSearchBySponsor(request.params.arguments);
          case 'search_by_intervention':
            return await this.handleSearchByIntervention(request.params.arguments);
          case 'get_recruiting_studies':
            return await this.handleGetRecruitingStudies(request.params.arguments);
          case 'search_by_date_range':
            return await this.handleSearchByDateRange(request.params.arguments);
          case 'get_studies_with_results':
            return await this.handleGetStudiesWithResults(request.params.arguments);
          case 'search_rare_diseases':
            return await this.handleSearchRareDiseases(request.params.arguments);
          case 'get_pediatric_studies':
            return await this.handleGetPediatricStudies(request.params.arguments);
          case 'get_similar_studies':
            return await this.handleGetSimilarStudies(request.params.arguments);
          case 'search_by_primary_outcome':
            return await this.handleSearchByPrimaryOutcome(request.params.arguments);
          case 'search_by_eligibility_criteria':
            return await this.handleSearchByEligibilityCriteria(request.params.arguments);
          case 'get_study_timeline':
            return await this.handleGetStudyTimeline(request.params.arguments);
          case 'search_international_studies':
            return await this.handleSearchInternationalStudies(request.params.arguments);
          default:
            throw new McpError(
              ErrorCode.MethodNotFound,
              `Unknown tool: ${request.params.name}`
            );
        }
      } catch (error) {
        if (error instanceof McpError) {
          throw error;
        }
        
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        throw new McpError(ErrorCode.InternalError, errorMessage);
      }
    });
  }

  private async handleSearchStudies(args: any) {
    const params: any = {
      'format': 'json',
      'pageSize': args?.pageSize || 10
    };

    // Build query parameters based on arguments
    if (args?.query) {
      params['query.term'] = args.query;
    }
    
    if (args?.condition) {
      params['query.cond'] = args.condition;
    }
    
    if (args?.intervention) {
      params['query.intr'] = args.intervention;
    }
    
    if (args?.location) {
      params['query.locn'] = args.location;
    }
    
    if (args?.phase) {
      params['filter.phase'] = args.phase;
    }
    
    if (args?.status) {
      params['filter.overallStatus'] = args.status;
    }
    
    if (args?.sex) {
      params['filter.sex'] = args.sex;
    }
    
    if (args?.age) {
      params['filter.stdAge'] = args.age;
    }

    try {
      const response: AxiosResponse<StudySearchResponse> = await this.axiosInstance.get('/studies', { params });
      
      const studies = response.data.studies || [];
      const results = studies.map(study => this.formatStudySummary(study));

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            totalCount: response.data.totalCount || 0,
            resultsShown: results.length,
            studies: results
          }, null, 2)
        }]
      };
    } catch (error) {
      if (axios.isAxiosError(error)) {
        return {
          content: [{
            type: 'text',
            text: `Clinical Trials API error: ${error.response?.data?.message || error.message}`
          }],
          isError: true
        };
      }
      throw error;
    }
  }

  private async handleGetStudyDetails(args: any) {
    if (!args?.nctId || !/^NCT\d{8}$/.test(args.nctId)) {
      throw new McpError(ErrorCode.InvalidParams, 'Valid NCT ID is required (format: NCT########)');
    }

    try {
      // Use the same endpoint as search but filter by NCT ID
      const response: AxiosResponse<StudySearchResponse> = await this.axiosInstance.get('/studies', {
        params: { 
          format: 'json',
          'query.term': args.nctId,
          'filter.ids': args.nctId,
          pageSize: 1
        }
      });

      if (!response.data.studies || response.data.studies.length === 0) {
        return {
          content: [{
            type: 'text',
            text: `No study found with NCT ID: ${args.nctId}`
          }],
          isError: true
        };
      }

      const study = response.data.studies[0];
      const detailedInfo = this.formatDetailedStudy(study);

      return {
        content: [{
          type: 'text',
          text: JSON.stringify(detailedInfo, null, 2)
        }]
      };
    } catch (error) {
      if (axios.isAxiosError(error)) {
        if (error.response?.status === 404) {
          return {
            content: [{
              type: 'text',
              text: `Study not found: ${args.nctId}`
            }],
            isError: true
          };
        }
        return {
          content: [{
            type: 'text',
            text: `Clinical Trials API error: ${error.response?.data?.message || error.message}`
          }],
          isError: true
        };
      }
      throw error;
    }
  }

  private async handleSearchByLocation(args: any) {
    const params: any = {
      'format': 'json',
      'pageSize': args?.pageSize || 10
    };

    // Build location query
    let locationQuery = '';
    if (args?.country) locationQuery += args.country;
    if (args?.state) locationQuery += (locationQuery ? ', ' : '') + args.state;
    if (args?.city) locationQuery += (locationQuery ? ', ' : '') + args.city;
    if (args?.facilityName) locationQuery += (locationQuery ? ', ' : '') + args.facilityName;

    if (locationQuery) {
      params['query.locn'] = locationQuery;
    }

    if (args?.distance && args?.city) {
      params['filter.distance'] = args.distance;
    }

    try {
      const response: AxiosResponse<StudySearchResponse> = await this.axiosInstance.get('/studies', { params });
      
      const studies = response.data.studies || [];
      const results = studies.map(study => ({
        ...this.formatStudySummary(study),
        locations: study.protocolSection.contactsLocationsModule?.locations?.slice(0, 3) || []
      }));

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            searchCriteria: { locationQuery, distance: args?.distance },
            totalCount: response.data.totalCount || 0,
            resultsShown: results.length,
            studies: results
          }, null, 2)
        }]
      };
    } catch (error) {
      if (axios.isAxiosError(error)) {
        return {
          content: [{
            type: 'text',
            text: `Clinical Trials API error: ${error.response?.data?.message || error.message}`
          }],
          isError: true
        };
      }
      throw error;
    }
  }

  private async handleSearchByCondition(args: any) {
    if (!args?.condition) {
      throw new McpError(ErrorCode.InvalidParams, 'Condition parameter is required');
    }

    const params: any = {
      'format': 'json',
      'pageSize': args?.pageSize || 10,
      'query.cond': args.condition
    };

    if (args?.phase) {
      params['filter.phase'] = args.phase;
    }

    if (args?.recruitmentStatus) {
      params['filter.overallStatus'] = args.recruitmentStatus;
    }

    try {
      const response: AxiosResponse<StudySearchResponse> = await this.axiosInstance.get('/studies', { params });
      
      const studies = response.data.studies || [];
      const results = studies.map(study => ({
        ...this.formatStudySummary(study),
        conditions: study.protocolSection.conditionsModule?.conditions || [],
        eligibility: {
          sex: study.protocolSection.eligibilityModule?.sex || 'Unknown',
          minimumAge: study.protocolSection.eligibilityModule?.minimumAge || 'Not specified',
          maximumAge: study.protocolSection.eligibilityModule?.maximumAge || 'Not specified',
          healthyVolunteers: study.protocolSection.eligibilityModule?.healthyVolunteers || false
        }
      }));

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            searchCriteria: { condition: args.condition, phase: args.phase, recruitmentStatus: args.recruitmentStatus },
            totalCount: response.data.totalCount || 0,
            resultsShown: results.length,
            studies: results
          }, null, 2)
        }]
      };
    } catch (error) {
      if (axios.isAxiosError(error)) {
        return {
          content: [{
            type: 'text',
            text: `Clinical Trials API error: ${error.response?.data?.message || error.message}`
          }],
          isError: true
        };
      }
      throw error;
    }
  }

  private async handleGetTrialStatistics(args: any) {
    // For statistics, we'll make a broader search and analyze the results
    const params: any = {
      'format': 'json',
      'pageSize': 100 // Get more results for better statistics
    };

    // Apply filters if provided
    if (args?.filters?.condition) {
      params['query.cond'] = args.filters.condition;
    }
    if (args?.filters?.phase) {
      params['filter.phase'] = args.filters.phase;
    }
    if (args?.filters?.status) {
      params['filter.overallStatus'] = args.filters.status;
    }

    try {
      const response: AxiosResponse<StudySearchResponse> = await this.axiosInstance.get('/studies', { params });
      
      const studies = response.data.studies || [];
      const stats = this.calculateStatistics(studies, args?.groupBy);

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            totalStudies: response.data.totalCount || 0,
            analyzedStudies: studies.length,
            groupBy: args?.groupBy || 'none',
            filters: args?.filters || {},
            statistics: stats
          }, null, 2)
        }]
      };
    } catch (error) {
      if (axios.isAxiosError(error)) {
        return {
          content: [{
            type: 'text',
            text: `Clinical Trials API error: ${error.response?.data?.message || error.message}`
          }],
          isError: true
        };
      }
      throw error;
    }
  }

  private formatStudySummary(study: Study) {
    return {
      nctId: study.protocolSection.identificationModule.nctId,
      title: study.protocolSection.identificationModule.briefTitle,
      status: study.protocolSection.statusModule.overallStatus,
      phase: study.protocolSection.designModule?.phases || ['Not specified'],
      studyType: study.protocolSection.designModule?.studyType || 'Unknown',
      sponsor: study.protocolSection.sponsorCollaboratorsModule?.leadSponsor?.name || 'Not specified',
      conditions: study.protocolSection.conditionsModule?.conditions?.slice(0, 3) || [],
      startDate: study.protocolSection.statusModule.startDateStruct?.date || 'Not specified'
    };
  }

  private formatDetailedStudy(study: Study) {
    return {
      identification: {
        nctId: study.protocolSection.identificationModule.nctId,
        briefTitle: study.protocolSection.identificationModule.briefTitle,
        officialTitle: study.protocolSection.identificationModule.officialTitle
      },
      status: {
        overallStatus: study.protocolSection.statusModule.overallStatus,
        startDate: study.protocolSection.statusModule.startDateStruct?.date,
        primaryCompletionDate: study.protocolSection.statusModule.primaryCompletionDateStruct?.date
      },
      design: {
        studyType: study.protocolSection.designModule?.studyType,
        phases: study.protocolSection.designModule?.phases
      },
      sponsor: study.protocolSection.sponsorCollaboratorsModule?.leadSponsor,
      conditions: study.protocolSection.conditionsModule?.conditions,
      eligibility: study.protocolSection.eligibilityModule,
      locations: study.protocolSection.contactsLocationsModule?.locations?.slice(0, 10)
    };
  }

  private calculateStatistics(studies: Study[], groupBy?: string) {
    if (!groupBy) {
      return {
        totalStudies: studies.length,
        byStatus: this.groupByField(studies, 'status'),
        byPhase: this.groupByField(studies, 'phase'),
        byStudyType: this.groupByField(studies, 'studyType')
      };
    }

    return this.groupByField(studies, groupBy);
  }

  private groupByField(studies: Study[], field: string) {
    const groups: { [key: string]: number } = {};

    studies.forEach(study => {
      let value: string | string[];
      
      switch (field) {
        case 'status':
          value = study.protocolSection.statusModule.overallStatus;
          break;
        case 'phase':
          value = study.protocolSection.designModule?.phases?.[0] || 'Not specified';
          break;
        case 'studyType':
          value = study.protocolSection.designModule?.studyType || 'Unknown';
          break;
        case 'condition':
          value = study.protocolSection.conditionsModule?.conditions?.[0] || 'Not specified';
          break;
        case 'sponsor':
          value = study.protocolSection.sponsorCollaboratorsModule?.leadSponsor?.name || 'Not specified';
          break;
        default:
          value = 'Unknown';
      }

      const key = Array.isArray(value) ? value[0] : value;
      groups[key] = (groups[key] || 0) + 1;
    });

    return groups;
  }

  private async handleSearchBySponsor(args: any) {
    if (!args?.sponsor) {
      throw new McpError(ErrorCode.InvalidParams, 'Sponsor parameter is required');
    }

    const params: any = {
      'format': 'json',
      'pageSize': args?.pageSize || 10,
      'query.spons': args.sponsor
    };

    if (args?.sponsorType) {
      params['filter.leadSponsorClass'] = args.sponsorType;
    }

    try {
      const response: AxiosResponse<StudySearchResponse> = await this.axiosInstance.get('/studies', { params });
      
      const studies = response.data.studies || [];
      const results = studies.map(study => ({
        ...this.formatStudySummary(study),
        sponsorDetails: study.protocolSection.sponsorCollaboratorsModule?.leadSponsor
      }));

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            searchCriteria: { sponsor: args.sponsor, sponsorType: args.sponsorType },
            totalCount: response.data.totalCount || 0,
            resultsShown: results.length,
            studies: results
          }, null, 2)
        }]
      };
    } catch (error) {
      if (axios.isAxiosError(error)) {
        return {
          content: [{
            type: 'text',
            text: `Clinical Trials API error: ${error.response?.data?.message || error.message}`
          }],
          isError: true
        };
      }
      throw error;
    }
  }

  private async handleSearchByIntervention(args: any) {
    if (!args?.intervention) {
      throw new McpError(ErrorCode.InvalidParams, 'Intervention parameter is required');
    }

    const params: any = {
      'format': 'json',
      'pageSize': args?.pageSize || 10,
      'query.intr': args.intervention
    };

    if (args?.interventionType) {
      params['filter.interventionType'] = args.interventionType;
    }

    if (args?.phase) {
      params['filter.phase'] = args.phase;
    }

    try {
      const response: AxiosResponse<StudySearchResponse> = await this.axiosInstance.get('/studies', { params });
      
      const studies = response.data.studies || [];
      const results = studies.map(study => this.formatStudySummary(study));

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            searchCriteria: { intervention: args.intervention, interventionType: args.interventionType, phase: args.phase },
            totalCount: response.data.totalCount || 0,
            resultsShown: results.length,
            studies: results
          }, null, 2)
        }]
      };
    } catch (error) {
      if (axios.isAxiosError(error)) {
        return {
          content: [{
            type: 'text',
            text: `Clinical Trials API error: ${error.response?.data?.message || error.message}`
          }],
          isError: true
        };
      }
      throw error;
    }
  }

  private async handleGetRecruitingStudies(args: any) {
    const params: any = {
      'format': 'json',
      'pageSize': args?.pageSize || 10,
      'filter.overallStatus': 'RECRUITING'
    };

    if (args?.condition) {
      params['query.cond'] = args.condition;
    }

    if (args?.location) {
      params['query.locn'] = args.location;
    }

    if (args?.ageGroup) {
      params['filter.stdAge'] = args.ageGroup;
    }

    try {
      const response: AxiosResponse<StudySearchResponse> = await this.axiosInstance.get('/studies', { params });
      
      const studies = response.data.studies || [];
      const results = studies.map(study => ({
        ...this.formatStudySummary(study),
        eligibility: {
          sex: study.protocolSection.eligibilityModule?.sex || 'Unknown',
          minimumAge: study.protocolSection.eligibilityModule?.minimumAge || 'Not specified',
          maximumAge: study.protocolSection.eligibilityModule?.maximumAge || 'Not specified',
          healthyVolunteers: study.protocolSection.eligibilityModule?.healthyVolunteers || false
        },
        locations: study.protocolSection.contactsLocationsModule?.locations?.slice(0, 2) || []
      }));

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            searchCriteria: { 
              recruitmentStatus: 'RECRUITING',
              condition: args?.condition,
              location: args?.location,
              ageGroup: args?.ageGroup
            },
            totalCount: response.data.totalCount || 0,
            resultsShown: results.length,
            studies: results
          }, null, 2)
        }]
      };
    } catch (error) {
      if (axios.isAxiosError(error)) {
        return {
          content: [{
            type: 'text',
            text: `Clinical Trials API error: ${error.response?.data?.message || error.message}`
          }],
          isError: true
        };
      }
      throw error;
    }
  }

  private async handleSearchByDateRange(args: any) {
    const params: any = {
      'format': 'json',
      'pageSize': args?.pageSize || 10
    };

    if (args?.startDateFrom) {
      params['filter.studyStartDateFrom'] = args.startDateFrom;
    }

    if (args?.startDateTo) {
      params['filter.studyStartDateTo'] = args.startDateTo;
    }

    if (args?.completionDateFrom) {
      params['filter.primaryCompletionDateFrom'] = args.completionDateFrom;
    }

    if (args?.completionDateTo) {
      params['filter.primaryCompletionDateTo'] = args.completionDateTo;
    }

    if (args?.condition) {
      params['query.cond'] = args.condition;
    }

    try {
      const response: AxiosResponse<StudySearchResponse> = await this.axiosInstance.get('/studies', { params });
      
      const studies = response.data.studies || [];
      const results = studies.map(study => ({
        ...this.formatStudySummary(study),
        dates: {
          startDate: study.protocolSection.statusModule.startDateStruct?.date,
          primaryCompletionDate: study.protocolSection.statusModule.primaryCompletionDateStruct?.date
        }
      }));

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            searchCriteria: {
              startDateFrom: args?.startDateFrom,
              startDateTo: args?.startDateTo,
              completionDateFrom: args?.completionDateFrom,
              completionDateTo: args?.completionDateTo,
              condition: args?.condition
            },
            totalCount: response.data.totalCount || 0,
            resultsShown: results.length,
            studies: results
          }, null, 2)
        }]
      };
    } catch (error) {
      if (axios.isAxiosError(error)) {
        return {
          content: [{
            type: 'text',
            text: `Clinical Trials API error: ${error.response?.data?.message || error.message}`
          }],
          isError: true
        };
      }
      throw error;
    }
  }

  private async handleGetStudiesWithResults(args: any) {
    const params: any = {
      'format': 'json',
      'pageSize': args?.pageSize || 10,
      'filter.overallStatus': 'COMPLETED',
      'filter.hasResults': true
    };

    if (args?.condition) {
      params['query.cond'] = args.condition;
    }

    if (args?.intervention) {
      params['query.intr'] = args.intervention;
    }

    if (args?.completedAfter) {
      params['filter.primaryCompletionDateFrom'] = args.completedAfter;
    }

    try {
      const response: AxiosResponse<StudySearchResponse> = await this.axiosInstance.get('/studies', { params });
      
      const studies = response.data.studies || [];
      const results = studies.map(study => ({
        ...this.formatStudySummary(study),
        completionDate: study.protocolSection.statusModule.primaryCompletionDateStruct?.date,
        hasResults: true
      }));

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            searchCriteria: {
              status: 'COMPLETED',
              hasResults: true,
              condition: args?.condition,
              intervention: args?.intervention,
              completedAfter: args?.completedAfter
            },
            totalCount: response.data.totalCount || 0,
            resultsShown: results.length,
            studies: results
          }, null, 2)
        }]
      };
    } catch (error) {
      if (axios.isAxiosError(error)) {
        return {
          content: [{
            type: 'text',
            text: `Clinical Trials API error: ${error.response?.data?.message || error.message}`
          }],
          isError: true
        };
      }
      throw error;
    }
  }

  private async handleSearchRareDiseases(args: any) {
    if (!args?.rareDisease) {
      throw new McpError(ErrorCode.InvalidParams, 'Rare disease parameter is required');
    }

    const params: any = {
      'format': 'json',
      'pageSize': args?.pageSize || 10,
      'query.cond': args.rareDisease
    };

    if (args?.recruitmentStatus) {
      params['filter.overallStatus'] = args.recruitmentStatus;
    }

    // Add terms commonly associated with rare diseases
    params['query.term'] = `${args.rareDisease} OR orphan OR rare`;

    try {
      const response: AxiosResponse<StudySearchResponse> = await this.axiosInstance.get('/studies', { params });
      
      const studies = response.data.studies || [];
      const results = studies.map(study => ({
        ...this.formatStudySummary(study),
        conditions: study.protocolSection.conditionsModule?.conditions || [],
        eligibility: {
          sex: study.protocolSection.eligibilityModule?.sex || 'Unknown',
          minimumAge: study.protocolSection.eligibilityModule?.minimumAge || 'Not specified',
          maximumAge: study.protocolSection.eligibilityModule?.maximumAge || 'Not specified'
        }
      }));

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            searchCriteria: {
              rareDisease: args.rareDisease,
              recruitmentStatus: args?.recruitmentStatus,
              searchNote: 'Includes orphan and rare disease designations'
            },
            totalCount: response.data.totalCount || 0,
            resultsShown: results.length,
            studies: results
          }, null, 2)
        }]
      };
    } catch (error) {
      if (axios.isAxiosError(error)) {
        return {
          content: [{
            type: 'text',
            text: `Clinical Trials API error: ${error.response?.data?.message || error.message}`
          }],
          isError: true
        };
      }
      throw error;
    }
  }

  private async handleGetPediatricStudies(args: any) {
    const params: any = {
      'format': 'json',
      'pageSize': args?.pageSize || 10,
      'filter.stdAge': 'CHILD'
    };

    if (args?.condition) {
      params['query.cond'] = args.condition;
    }

    if (args?.ageRange) {
      switch (args.ageRange) {
        case 'INFANT':
          params['filter.minimumAge'] = '0 Years';
          params['filter.maximumAge'] = '2 Years';
          break;
        case 'CHILD':
          params['filter.minimumAge'] = '2 Years';
          params['filter.maximumAge'] = '12 Years';
          break;
        case 'ADOLESCENT':
          params['filter.minimumAge'] = '12 Years';
          params['filter.maximumAge'] = '18 Years';
          break;
      }
    }

    if (args?.recruitmentStatus) {
      params['filter.overallStatus'] = args.recruitmentStatus;
    }

    try {
      const response: AxiosResponse<StudySearchResponse> = await this.axiosInstance.get('/studies', { params });
      
      const studies = response.data.studies || [];
      const results = studies.map(study => ({
        ...this.formatStudySummary(study),
        conditions: study.protocolSection.conditionsModule?.conditions || [],
        eligibility: {
          sex: study.protocolSection.eligibilityModule?.sex || 'Unknown',
          minimumAge: study.protocolSection.eligibilityModule?.minimumAge || 'Not specified',
          maximumAge: study.protocolSection.eligibilityModule?.maximumAge || 'Not specified',
          healthyVolunteers: study.protocolSection.eligibilityModule?.healthyVolunteers || false
        },
        locations: study.protocolSection.contactsLocationsModule?.locations?.slice(0, 2) || []
      }));

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            searchCriteria: {
              targetPopulation: 'PEDIATRIC',
              condition: args?.condition,
              ageRange: args?.ageRange,
              recruitmentStatus: args?.recruitmentStatus
            },
            totalCount: response.data.totalCount || 0,
            resultsShown: results.length,
            studies: results
          }, null, 2)
        }]
      };
    } catch (error) {
      if (axios.isAxiosError(error)) {
        return {
          content: [{
            type: 'text',
            text: `Clinical Trials API error: ${error.response?.data?.message || error.message}`
          }],
          isError: true
        };
      }
      throw error;
    }
  }

  private async handleGetSimilarStudies(args: any) {
    if (!args?.nctId || !/^NCT\d{8}$/.test(args.nctId)) {
      throw new McpError(ErrorCode.InvalidParams, 'Valid NCT ID is required (format: NCT########)');
    }

    try {
      // First get the reference study to extract similarity criteria
      const referenceResponse: AxiosResponse<StudySearchResponse> = await this.axiosInstance.get('/studies', {
        params: { 
          format: 'json',
          'query.term': args.nctId,
          pageSize: 1
        }
      });

      if (!referenceResponse.data.studies || referenceResponse.data.studies.length === 0) {
        return {
          content: [{
            type: 'text',
            text: `Reference study not found: ${args.nctId}`
          }],
          isError: true
        };
      }

      const referenceStudy = referenceResponse.data.studies[0];
      const similarityType = args.similarityType || 'CONDITION';
      let searchParams: any = {
        'format': 'json',
        'pageSize': args?.pageSize || 10
      };

      // Build search based on similarity type
      switch (similarityType) {
        case 'CONDITION':
          const condition = referenceStudy.protocolSection.conditionsModule?.conditions?.[0];
          if (condition) {
            searchParams['query.cond'] = condition;
          }
          break;
        case 'SPONSOR':
          const sponsor = referenceStudy.protocolSection.sponsorCollaboratorsModule?.leadSponsor?.name;
          if (sponsor) {
            searchParams['query.spons'] = sponsor;
          }
          break;
        case 'PHASE':
          const phase = referenceStudy.protocolSection.designModule?.phases?.[0];
          if (phase) {
            searchParams['filter.phase'] = phase;
          }
          break;
      }

      const response: AxiosResponse<StudySearchResponse> = await this.axiosInstance.get('/studies', { params: searchParams });
      
      const studies = response.data.studies || [];
      const results = studies
        .filter(study => study.protocolSection.identificationModule.nctId !== args.nctId) // Exclude reference study
        .map(study => this.formatStudySummary(study));

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            referenceStudy: {
              nctId: args.nctId,
              title: referenceStudy.protocolSection.identificationModule.briefTitle
            },
            similarityType,
            totalCount: response.data.totalCount || 0,
            resultsShown: results.length,
            similarStudies: results
          }, null, 2)
        }]
      };
    } catch (error) {
      if (axios.isAxiosError(error)) {
        return {
          content: [{
            type: 'text',
            text: `Clinical Trials API error: ${error.response?.data?.message || error.message}`
          }],
          isError: true
        };
      }
      throw error;
    }
  }

  private async handleSearchByPrimaryOutcome(args: any) {
    if (!args?.outcome) {
      throw new McpError(ErrorCode.InvalidParams, 'Outcome parameter is required');
    }

    const params: any = {
      'format': 'json',
      'pageSize': args?.pageSize || 10,
      'query.outc': args.outcome
    };

    if (args?.condition) {
      params['query.cond'] = args.condition;
    }

    if (args?.phase) {
      params['filter.phase'] = args.phase;
    }

    try {
      const response: AxiosResponse<StudySearchResponse> = await this.axiosInstance.get('/studies', { params });
      
      const studies = response.data.studies || [];
      const results = studies.map(study => this.formatStudySummary(study));

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            searchCriteria: { 
              primaryOutcome: args.outcome,
              condition: args?.condition,
              phase: args?.phase
            },
            totalCount: response.data.totalCount || 0,
            resultsShown: results.length,
            studies: results
          }, null, 2)
        }]
      };
    } catch (error) {
      if (axios.isAxiosError(error)) {
        return {
          content: [{
            type: 'text',
            text: `Clinical Trials API error: ${error.response?.data?.message || error.message}`
          }],
          isError: true
        };
      }
      throw error;
    }
  }

  private async handleSearchByEligibilityCriteria(args: any) {
    const params: any = {
      'format': 'json',
      'pageSize': args?.pageSize || 10
    };

    if (args?.minAge) {
      params['filter.minimumAge'] = args.minAge;
    }

    if (args?.maxAge) {
      params['filter.maximumAge'] = args.maxAge;
    }

    if (args?.sex) {
      params['filter.sex'] = args.sex;
    }

    if (args?.healthyVolunteers !== undefined) {
      params['filter.healthyVolunteers'] = args.healthyVolunteers;
    }

    if (args?.condition) {
      params['query.cond'] = args.condition;
    }

    if (args?.inclusionKeywords) {
      params['query.eligibility'] = args.inclusionKeywords;
    }

    try {
      const response: AxiosResponse<StudySearchResponse> = await this.axiosInstance.get('/studies', { params });
      
      const studies = response.data.studies || [];
      let filteredStudies = studies;

      // Apply exclusion keyword filtering if specified
      if (args?.exclusionKeywords) {
        const exclusionWords = args.exclusionKeywords.toLowerCase().split(/\s+/);
        filteredStudies = studies.filter(study => {
          const eligibilityCriteria = study.protocolSection.eligibilityModule?.eligibilityCriteria?.toLowerCase() || '';
          return !exclusionWords.some((word: string) => eligibilityCriteria.includes(word));
        });
      }

      const results = filteredStudies.map(study => ({
        ...this.formatStudySummary(study),
        eligibility: {
          sex: study.protocolSection.eligibilityModule?.sex || 'Unknown',
          minimumAge: study.protocolSection.eligibilityModule?.minimumAge || 'Not specified',
          maximumAge: study.protocolSection.eligibilityModule?.maximumAge || 'Not specified',
          healthyVolunteers: study.protocolSection.eligibilityModule?.healthyVolunteers || false,
          criteriaPreview: study.protocolSection.eligibilityModule?.eligibilityCriteria?.substring(0, 200) + '...' || 'Not available'
        }
      }));

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            searchCriteria: {
              minAge: args?.minAge,
              maxAge: args?.maxAge,
              sex: args?.sex,
              healthyVolunteers: args?.healthyVolunteers,
              condition: args?.condition,
              inclusionKeywords: args?.inclusionKeywords,
              exclusionKeywords: args?.exclusionKeywords
            },
            totalCount: response.data.totalCount || 0,
            resultsShown: results.length,
            studies: results
          }, null, 2)
        }]
      };
    } catch (error) {
      if (axios.isAxiosError(error)) {
        return {
          content: [{
            type: 'text',
            text: `Clinical Trials API error: ${error.response?.data?.message || error.message}`
          }],
          isError: true
        };
      }
      throw error;
    }
  }

  private async handleGetStudyTimeline(args: any) {
    const params: any = {
      'format': 'json',
      'pageSize': args?.pageSize || 10
    };

    if (args?.condition) {
      params['query.cond'] = args.condition;
    }

    if (args?.sponsor) {
      params['query.spons'] = args.sponsor;
    }

    if (args?.phase) {
      params['filter.phase'] = args.phase;
    }

    // Apply timeline type filtering
    const timelineType = args?.timelineType || 'CURRENT';
    switch (timelineType) {
      case 'CURRENT':
        params['filter.overallStatus'] = 'RECRUITING,NOT_YET_RECRUITING,ACTIVE_NOT_RECRUITING';
        break;
      case 'COMPLETED':
        params['filter.overallStatus'] = 'COMPLETED';
        break;
      case 'UPCOMING':
        params['filter.overallStatus'] = 'NOT_YET_RECRUITING';
        const futureDate = new Date();
        futureDate.setDate(futureDate.getDate() + 30);
        params['filter.studyStartDateFrom'] = futureDate.toISOString().split('T')[0];
        break;
    }

    try {
      const response: AxiosResponse<StudySearchResponse> = await this.axiosInstance.get('/studies', { params });
      
      const studies = response.data.studies || [];
      const results = studies.map(study => ({
        ...this.formatStudySummary(study),
        timeline: {
          startDate: study.protocolSection.statusModule.startDateStruct?.date,
          primaryCompletionDate: study.protocolSection.statusModule.primaryCompletionDateStruct?.date,
          status: study.protocolSection.statusModule.overallStatus,
          daysFromStart: study.protocolSection.statusModule.startDateStruct?.date ? 
            Math.floor((new Date().getTime() - new Date(study.protocolSection.statusModule.startDateStruct.date).getTime()) / (1000 * 60 * 60 * 24)) : null
        }
      }));

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            searchCriteria: {
              condition: args?.condition,
              sponsor: args?.sponsor,
              phase: args?.phase,
              timelineType
            },
            totalCount: response.data.totalCount || 0,
            resultsShown: results.length,
            studies: results
          }, null, 2)
        }]
      };
    } catch (error) {
      if (axios.isAxiosError(error)) {
        return {
          content: [{
            type: 'text',
            text: `Clinical Trials API error: ${error.response?.data?.message || error.message}`
          }],
          isError: true
        };
      }
      throw error;
    }
  }

  private async handleSearchInternationalStudies(args: any) {
    const params: any = {
      'format': 'json',
      'pageSize': args?.pageSize || 10
    };

    if (args?.condition) {
      params['query.cond'] = args.condition;
    }

    if (args?.phase) {
      params['filter.phase'] = args.phase;
    }

    if (args?.includeCountry) {
      params['query.locn'] = args.includeCountry;
    }

    try {
      const response: AxiosResponse<StudySearchResponse> = await this.axiosInstance.get('/studies', { params });
      
      const studies = response.data.studies || [];
      
      // Filter for international studies
      let filteredStudies = studies.filter(study => {
        const locations = study.protocolSection.contactsLocationsModule?.locations || [];
        const countries = new Set(locations.map(loc => loc.country));
        
        // Check minimum countries requirement
        if (args?.minCountries && countries.size < args.minCountries) {
          return false;
        }

        // Check country exclusion
        if (args?.excludeCountry && countries.has(args.excludeCountry)) {
          return false;
        }

        // Only include studies with multiple countries (international)
        return countries.size >= 2;
      });

      const results = filteredStudies.map(study => {
        const locations = study.protocolSection.contactsLocationsModule?.locations || [];
        const countries = [...new Set(locations.map(loc => loc.country))];
        
        return {
          ...this.formatStudySummary(study),
          internationalDetails: {
            totalCountries: countries.length,
            countries: countries,
            totalLocations: locations.length,
            sampleLocations: locations.slice(0, 3)
          }
        };
      });

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            searchCriteria: {
              condition: args?.condition,
              excludeCountry: args?.excludeCountry,
              includeCountry: args?.includeCountry,
              minCountries: args?.minCountries,
              phase: args?.phase,
              note: 'Only showing studies with 2+ countries'
            },
            totalCount: response.data.totalCount || 0,
            resultsShown: results.length,
            internationalStudies: results
          }, null, 2)
        }]
      };
    } catch (error) {
      if (axios.isAxiosError(error)) {
        return {
          content: [{
            type: 'text',
            text: `Clinical Trials API error: ${error.response?.data?.message || error.message}`
          }],
          isError: true
        };
      }
      throw error;
    }
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('Clinical Trials MCP server running on stdio');
  }
}

const server = new ClinicalTrialsServer();
server.run().catch(console.error);
