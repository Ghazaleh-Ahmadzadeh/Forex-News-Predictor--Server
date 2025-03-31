import pandas as pd
import numpy as np
from statsmodels.tsa.arima.model import ARIMA
import pickle

# Load CSV data from the rate_sentiment table export
df = pd.read_csv('rate_sentiment.csv')  
df['date'] = pd.to_datetime(df['date'])
df.sort_values('date', inplace=True)

# Use the exchange_rate column as the time series data
ts = df.set_index('date')['exchange_rate']

# Define and fit the ARIMA model (parameters may need tuning)
model = ARIMA(ts, order=(1, 1, 1))
model_fit = model.fit()

# Compute in-sample predictions for error calculation
predictions = model_fit.predict(start=ts.index[0], end=ts.index[-1])
rmse = np.sqrt(np.mean((predictions - ts) ** 2))
# Compute RMSE as a percentage of the mean exchange rate
rmse_percent = (rmse / ts.mean()) * 100

print("Training RMSE (% of mean):", rmse_percent)

# Attach the RMSE percentage to the model object
model_fit.rmse_percent = rmse_percent

# Save the model for later use by the prediction API
with open('arima_model.pkl', 'wb') as f:
    pickle.dump(model_fit, f)

print("Model trained and saved as arima_model.pkl")

