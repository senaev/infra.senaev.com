export const TOKEN_senaev_com_bot: string = process.env.TOKEN_senaev_com_bot as string;

if (!TOKEN_senaev_com_bot) {
    throw new Error('TOKEN_senaev_com_bot is not set');
}
