#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <math.h>

int main()
{
    FILE *file;
    char line[64];
    char *token;
    int grades[10] = {0, 0, 0, 0, 0, 0, 0, 0, 0, 0};
    int total;
    int recorded;
    int absent;
    int sum;
    int i;
    double mean;
    double difference;
    double variance;
    double standard_deviation;

    total = 10;
    recorded = 0;
    sum = 0;
    variance = 0.0;

    file = fopen("class01_activity01.csv", "r");
    fgets(line, 64, file);

    while (fgets(line, 64, file) != NULL)
    {
        line[strcspn(line, "\n")] = '\0';
        token = strtok(line, ",");
        token = strtok(NULL, ",");
        grades[recorded] = atoi(token);
        recorded = recorded + 1;
    }

    fclose(file);

    absent = total - recorded;

    for (i = 0; i < total; i++)
    {
        sum = sum + grades[i];
    }

    mean = sum / 10.0;

    for (i = 0; i < total; i++)
    {
        difference = grades[i] - mean;
        variance = variance + difference * difference;
    }

    standard_deviation = sqrt(variance / 9.0);

    printf("total students = %d\n", total);
    printf("absent students = %d\n", absent);
    printf("grade mean = %.2f\n", mean);
    printf("grade sd = %.2f\n", standard_deviation);

    return 0;
}
