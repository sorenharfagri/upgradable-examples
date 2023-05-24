export enum DepositsV1Errors {
    ZeroTxValue = "ZeroTxValue",
    DepositNotFound = "DepositNotFound",
    DepositAlreadyExists = "DepositAlreadyExists",
    FailedToSendEther = "FailedToSendEther"
}

export enum DepositsV2Errors {
    InvalidTxValue = "InvalidTxValue",
    DepositNotFound = "DepositNotFound",
    DepositAlreadyExists = "DepositAlreadyExists",
    FailedToSendEther = "FailedToSendEther",
    AlreadyInitialized = "AlreadyInitialized",
    ProfitNotFound = "ProfitNotFound",
    NotAnOwner = "NotAnOwner"
}