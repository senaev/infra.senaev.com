import { PositiveInteger } from '../../types/Number/PositiveInteger';
import { UnsignedInteger } from '../../types/Number/UnsignedInteger';

import { DEFAULT_PAGE } from './DEFAULT_PAGE';

export const calculatePaginationParameters = ({
    page,
    pageSize,
    totalCount,
}: {
    page: UnsignedInteger;
    pageSize: PositiveInteger;
    totalCount: UnsignedInteger;
}): {
    canGoToPreviousPage: boolean;
    canGoToNextPage: boolean;
    totalPages: UnsignedInteger;
} => {
    const canGoToPreviousPage = page > DEFAULT_PAGE;

    const totalPages = Math.ceil(totalCount / pageSize);
    const isLastPage = page >= totalPages;

    return {
        canGoToPreviousPage,
        canGoToNextPage: !isLastPage,
        totalPages,
    };
};
