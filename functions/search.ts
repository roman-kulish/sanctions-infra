import { APIGatewayProxyEvent, APIGatewayProxyEventV2, APIGatewayProxyResult, APIGatewayProxyResultV2 } from 'aws-lambda';
import { TranslateClient, TranslateTextCommand } from "@aws-sdk/client-translate";
import { Hit, MeiliSearch } from 'meilisearch'
import * as iuliia from "iuliia";

const meiliSearchApiUrl = process.env.MEILISEARCH_API_URL!;
const meiliSearchApiKey = process.env.MEILISEARCH_API_KEY!;
const meiliSearchIndex = process.env.MEILISEARCH_INDEX!;

const sourceLanguage = 'uk';

const searchLimit = process.env.SEARCH_RESULTS_LIMIT ? Number(process.env.SEARCH_RESULTS_LIMIT) : 10;
const searchInputLimit = process.env.SEARCH_INPUT_LIMIT ? Number(process.env.SEARCH_INPUT_LIMIT) : 100;
const smartSearchLimit = process.env.SMART_SEARCH_RESULTS_LIMIT ? Number(process.env.SMART_SEARCH_RESULTS_LIMIT) : 5;
const smartSearchInputLimit = process.env.SMART_SEARCH_INPUT_LIMIT ? Number(process.env.SMART_SEARCH_INPUT_LIMIT) : 1000;
const individualSearchRankingThreshold = process.env.INDIVIDUAL_SEARCH_RANKING_THRESHOLD ? Number(process.env.INDIVIDUAL_SEARCH_RANKING_THRESHOLD) : undefined;
const entitySearchRankingThreshold = process.env.ENTITY_SEARCH_RANKING_THRESHOLD ? Number(process.env.ENTITY_SEARCH_RANKING_THRESHOLD) : undefined;
const highlightPreTag = process.env.HIGHLIGHT_PRE_TAG;
const highlightPostTag = process.env.HIGHLIGHT_POST_TAG;

type Language = 'ru' | 'en';
type SearchCountry = 'au' | 'nz';
type SearchType = 'individual' | 'entity';
type SearchFilter = { type?: SearchType, country?: SearchCountry };

const translateClient = new TranslateClient();

const searchClient = new MeiliSearch({
    host: meiliSearchApiUrl,
    apiKey: meiliSearchApiKey,
})

const translateText = async (input: string, targetLanguage: Language): Promise<string | undefined> => {
    const params = new TranslateTextCommand({
        SourceLanguageCode: sourceLanguage,
        TargetLanguageCode: targetLanguage,
        Text: input
    });

    const { TranslatedText: translated } = await translateClient.send(params);

    return translated;
}

const split = (input: string): string[] => input.trim().split("\n").map(x => x.trim()).filter(Boolean);

const prepare = async (input: string, targetLanguage: Language): Promise<string[]> => {
    const translated = await translateText(input.trim(), targetLanguage)

    if (!translated) {
        return [];
    }

    return split(translated);
}

const searchText = async (q: string, limit: number, filter?: SearchFilter, rankingScoreThreshold?: number, indexName = 'sanctions') => {
    const index = await searchClient.getIndex(indexName);

    let filterParts = [];

    if (filter?.type) {
        filterParts.push(`type = ${filter.type}`);
    }

    if (filter?.country) {
        filterParts.push(`country = ${filter.country}`);
    }

    const attributesToHighlight = ['name'];

    if (indexName === 'entities') {
        attributesToHighlight.push('fts');
    }

    return index.search(
        q,
        {
            attributesToHighlight,
            showRankingScore: true,
            ...(filterParts.length && { filter: filterParts.join(' AND ') }),
            ...(rankingScoreThreshold && { rankingScoreThreshold }),
            ...(highlightPreTag && { highlightPreTag }),
            ...(highlightPostTag && { highlightPostTag }),
            limit
        })
}

const formatHit = ({ name, type, country, _formatted, _rankingScore: score }: Hit<Record<string, any>>) => {
    const nameFormatted = _formatted?.fts ? _formatted.fts.join('<br />') : _formatted?.name;

    return {
        name,
        ...(nameFormatted && { nameFormatted }),
        type,
        country,
        score
    };
};

const searchCandidates = async (q: string, type: SearchType, limit: number, rankingScoreThreshold?: number, index = 'sanctions') =>
    (await Promise.all([
        searchText(q, limit, { type, country: 'au' }, rankingScoreThreshold, index),
        searchText(q, limit, { type, country: 'nz' }, rankingScoreThreshold, index)
    ])).flatMap((x) => x.hits).map(formatHit).sort(({ score: a }, { score: b }) => b - a);

const searchIndividuals = async (input: string, limit = smartSearchLimit): Promise<any> => {
    const original = split(input);

    if (!original.length) {
        return [];
    }

    const lines = await prepare(original.join("\n"), 'ru');

    return Promise.all(lines.map(async (x, idx) => {
        const line = iuliia.translate(x, iuliia.ICAO_DOC_9303);
        const candidates = await searchCandidates(line, 'individual', limit, individualSearchRankingThreshold);

        return {
            q: original[idx],
            x: line,
            candidates
        }
    }));
};

const searchEntities = async (input: string, limit = smartSearchLimit): Promise<any> => {
    const original = split(input);

    if (!original.length) {
        return [];
    }

    return Promise.all(original.map(async (line, idx) => {
        const candidates = await searchCandidates(
            line.replace(/\p{Quotation_Mark}/gu, '').replace(/-/g, ' '),
            'entity',
            limit,
            entitySearchRankingThreshold,
            'entities'
        );

        return {
            q: original[idx],
            x: line,
            candidates
        }
    }));
}

const searchDirect = async (input: string, filter?: SearchFilter, limit = searchLimit): Promise<any> => {
    const q = input.trim();

    if (!q) {
        return [];
    }

    const { hits } = await searchText(q, limit, filter);

    return hits.map(formatHit);
}

const errorResponse = (statusCode: number, message: string) => ({
    statusCode,
    body: JSON.stringify({ message }),
    headers: {
        'content-type': 'application/json'
    }
});

const response = (statusCode: number, results: any[]) => ({
    statusCode,
    body: JSON.stringify({ results }),
    headers: {
        'content-type': 'application/json'
    }
})

type SearchRequest = {
    q: string,
    filter?: SearchFilter,
    limit?: number
}

export const searchHandler = async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> => {
    const { q, filter, limit }: SearchRequest = JSON.parse(event.body || '');

    const query = q.trim();

    if (!query) {
        return response(200, []);
    }

    if (query.length > searchInputLimit) {
        return errorResponse(400, 'query is too long');
    }

    if (filter?.type && !['individual', 'entity'].includes(filter.type)) {
        return errorResponse(400, 'invalid filter type');
    }

    if (filter?.country && !['au', 'nz'].includes(filter.country)) {
        return errorResponse(400, 'invalid filter country');
    }

    const searchLimitRequest = limit ? Number(limit) : undefined;
    const newSearchLimit = searchLimitRequest && searchLimitRequest > 0 && searchLimitRequest <= searchLimit ? searchLimitRequest : searchLimit;
    const results = await searchDirect(query, filter, newSearchLimit);

    return response(200, results);
}

export const smartSearchHandler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    const { q, filter }: SearchRequest = JSON.parse(event.body || '');

    const query = q.trim()

    if (!query) {
        return response(200, []);
    }

    if (query.length > smartSearchInputLimit) {
        return errorResponse(400, 'query is too long');
    }

    let results;

    switch (filter?.type) {
        case 'individual':
            results = await searchIndividuals(query, smartSearchLimit);
            break;

        case 'entity':
            results = await searchEntities(query, smartSearchLimit);
            break;

        default:
            return errorResponse(400, 'invalid filter type');
    }

    return response(200, results);
}
